/**
 * NotificationCommand（NTF-001）
 * notifier 服务 -> 渠道投递的执行命令（模板渲染后的最终内容）。
 */

export type NotificationCommand = {
  notification_id: string;
  user_id: string;
  channel: 'in-app' | 'email' | 'wecom';
  template_version: number;
  content: {
    title: string;
    body: string;
    url: string;
    price_cent: number;
    market_price_cent: number | null;
    discount_rate: number | null;
    reason: string;
  };
};
