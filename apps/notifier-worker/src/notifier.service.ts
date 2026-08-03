import type { LowPriceMatchEvent, NotificationCommand } from '@xianyu/contracts';
import {
  NotificationAlreadyExistsError,
  type NotificationRepository,
  type UserRepository,
} from '@xianyu/database';
import {
  renderEmail,
  renderInApp,
  renderWecom,
  TEMPLATE_VERSION,
} from './templates/message-templates';

/**
 * 通知服务（NTF-001）
 * - 幂等：idempotencyKey = match.event_id + monitor_id + channel（同事件不重复通知）。
 * - 用户偏好：notificationPreferences.channels 决定投递渠道（未配置默认全部）。
 * - 产出 NotificationCommand（模板渲染后的标题/正文/链接/原因）。
 */

export type NotifierDeps = {
  notifications: NotificationRepository;
  users: UserRepository;
};

export type NotificationPreference = {
  channels?: { 'in-app'?: boolean; email?: boolean; wecom?: boolean };
};

const ALL_CHANNELS = ['in-app', 'email', 'wecom'] as const;

export class NotifierService {
  constructor(
    private readonly deps: NotifierDeps,
    private readonly productUrlOf: (match: LowPriceMatchEvent) => string,
  ) {}

  /** 处理一条低价命中：幂等创建通知记录并产出渠道命令 */
  async handle(match: LowPriceMatchEvent, userId: string): Promise<NotificationCommand[]> {
    const user = await this.deps.users.findById(userId);
    if (!user) return [];

    const preference = (user.notificationPreferences ?? {}) as NotificationPreference;
    const channels = preference.channels ?? {};
    const commands: NotificationCommand[] = [];

    for (const channel of ALL_CHANNELS) {
      if (channels[channel] === false) continue; // 显式关闭的渠道跳过
      const idempotencyKey = `${match.event_id}:${match.monitor_id}:${channel}`;
      try {
        const record = await this.deps.notifications.create({
          userId,
          monitorId: match.monitor_id,
          productId: match.product_id,
          channel,
          eventType: 'low_price',
          ruleVersion: `v${match.rule_version}`,
          productPriceCent: match.price_cent,
          marketPriceCent: match.market_price_cent,
          discountRate: match.discount_rate ?? undefined,
          idempotencyKey,
        });
        commands.push(this.toCommand(record.id, match, channel));
      } catch (err) {
        if (err instanceof NotificationAlreadyExistsError) continue; // 幂等跳过（重复事件）
        throw err;
      }
    }
    return commands;
  }

  private toCommand(
    notificationId: string,
    match: LowPriceMatchEvent,
    channel: 'in-app' | 'email' | 'wecom',
  ): NotificationCommand {
    const ctx = { match, productUrl: this.productUrlOf(match) };
    let title: string;
    let body: string;
    if (channel === 'email') {
      const email = renderEmail(ctx);
      title = email.subject;
      body = email.body;
    } else if (channel === 'wecom') {
      const wecom = renderWecom(ctx);
      title = wecom.title;
      body = wecom.body;
    } else {
      const inApp = renderInApp(ctx);
      title = inApp.title;
      body = inApp.body;
    }
    return {
      notification_id: notificationId,
      user_id: match.monitor_id,
      channel,
      template_version: TEMPLATE_VERSION,
      content: {
        title,
        body,
        url: ctx.productUrl,
        price_cent: match.price_cent,
        market_price_cent: match.market_price_cent,
        discount_rate: match.discount_rate,
        reason: match.reason,
      },
    };
  }
}
