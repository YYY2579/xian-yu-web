/**
 * 商品/价格/通知视图类型（API-004）
 * 金额对外使用 number（整数分）。
 */

export type ProductView = {
  id: string;
  source: string;
  sourceProductId: string;
  canonicalKey: string;
  title: string;
  normalizedTitle: string;
  url: string;
  currentPriceCent: number;
  currency: string;
  condition: string | null;
  location: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type PricePointView = {
  id: number;
  priceCent: number;
  shippingFeeCent: number | null;
  observedAt: string;
};

export type NotificationView = {
  id: string;
  channel: string;
  eventType: string;
  ruleVersion: string;
  productPriceCent: number;
  marketPriceCent: number | null;
  discountRate: number | null;
  deliveryStatus: string;
  retryCount: number;
  createdAt: string;
};
