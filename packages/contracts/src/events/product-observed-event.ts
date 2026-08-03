/**
 * ProductObservedEvent（PROC-004）
 * 清洗/去重后的有效商品观察事件：processor -> analyzer 的消息契约。
 * 携带价格、来源与触发监控信息，供价格基线与低价判定消费。
 */

export const PRODUCT_OBSERVED_EVENT_SCHEMA_VERSION = 1;

export type ProductObservedEvent = {
  event_id: string;
  schema_version: number;
  /** 观察时间（ISO 8601 带时区，来自 RawProductEvent.occurred_at） */
  observed_at: string;
  /** 商品主记录 ID */
  product_id: string;
  canonical_key: string;
  source: string;
  source_product_id: string;
  /** 当前价格（整数分） */
  price_cent: number;
  currency: string;
  /** 触发采集的监控任务 ID（无则 null） */
  monitor_id: string | null;
  /** 触发关键词（无则 null） */
  keyword: string | null;
};
