import type { LowPriceMatchEvent } from '@xianyu/contracts';

/**
 * 通知模板（NTF-001）
 * - 站内信/邮件/企业微信均为纯文本模板（邮件/企微不依赖 HTML 渲染）。
 * - 内容必须含：商品链接、当前价、市场价/折扣、命中原因与规则版本。
 * - 模板带版本号（TEMPLATE_VERSION），内容变更时递增。
 */

export const TEMPLATE_VERSION = 1;

export type TemplateContext = {
  match: LowPriceMatchEvent;
  /** 商品原始链接（由匹配阶段提供，回退到占位链接） */
  productUrl: string;
};

function formatPrice(cent: number | null): string {
  if (cent === null) return '未知';
  return `¥${(cent / 100).toFixed(2)}`;
}

function reasonText(reason: string): string {
  const map: Record<string, string> = {
    below_both_targets: '同时低于您的目标价与市场价基线',
    below_user_target: '低于您的目标价（可比样本不足，未引用市场价）',
    above_target: '未低于阈值',
    insufficient_samples: '可比样本不足，未命中',
  };
  return map[reason] ?? reason;
}

export function renderInApp(ctx: TemplateContext): { title: string; body: string } {
  const { match, productUrl } = ctx;
  const discount =
    match.discount_rate !== null
      ? `折扣约 ${(match.discount_rate * 100).toFixed(1)}%`
      : '暂无市场折扣';
  return {
    title: `【低价提醒】${match.keyword} 现价 ${formatPrice(match.price_cent)}`,
    body: [
      `关键词：${match.keyword}`,
      `当前价：${formatPrice(match.price_cent)}（目标价 ${formatPrice(match.target_price_cent)}）`,
      `市场价：${formatPrice(match.market_price_cent)}，${discount}`,
      `命中原因：${reasonText(match.reason)}（规则 v${match.rule_version}）`,
      `查看商品：${productUrl}`,
    ].join('\n'),
  };
}

export function renderEmail(ctx: TemplateContext): { subject: string; body: string } {
  const inApp = renderInApp(ctx);
  return {
    subject: inApp.title,
    body: `您好，您监控的商品出现低价：\n\n${inApp.body}\n\n-- 闲鱼低价商品监控`,
  };
}

export function renderWecom(ctx: TemplateContext): { title: string; body: string } {
  const inApp = renderInApp(ctx);
  return {
    title: inApp.title,
    body: inApp.body,
  };
}
