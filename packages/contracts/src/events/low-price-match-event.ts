/**
 * LowPriceMatchEvent（PRI-003）
 * 分析 worker 匹配到低价后的输出：通知 worker 的输入契约。
 */

export type LowPriceMatchEvent = {
  event_id: string;
  schema_version: number;
  matched_at: string;
  monitor_id: string;
  product_id: string;
  canonical_key: string;
  keyword: string;
  price_cent: number;
  target_price_cent: number;
  market_price_cent: number | null;
  discount_rate: number | null;
  reason: string;
  score: number;
  risk_score: number;
  rule_version: number;
};
