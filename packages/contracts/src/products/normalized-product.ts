/**
 * NormalizedProduct（PROC-001）
 * 清洗后的统一商品模型：processor 输入 RawProductEvent，输出本结构；
 * 保留原始标题/价格文本用于审计，normalized_title 供匹配与检索。
 */

export type NormalizedProduct = {
  /** 去重键：source + source_product_id */
  canonical_key: string;
  source: string;
  source_product_id: string;
  /** 清洗后的展示标题（空白折叠） */
  title: string;
  /** 归一化标题（小写 + 空白折叠），用于关键词匹配 */
  normalized_title: string;
  url: string;
  seller_id_hash: string | null;
  /** 价格（整数分） */
  price_cent: number;
  currency: string;
  shipping_fee_cent: number | null;
  condition: string | null;
  location: string | null;
  /** ISO 8601 带时区 */
  published_at: string | null;
  /** 清洗时间（ISO 8601 带时区） */
  normalized_at: string;

  // ---- 审计保留字段 ----
  original_title: string;
  original_price_text: string | null;
  /** 非致命问题（如标题含异常符号），不阻断入库 */
  warnings: string[];
};
