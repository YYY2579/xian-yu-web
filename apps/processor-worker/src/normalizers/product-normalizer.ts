import type { NormalizedProduct, RawProductEvent } from '@xianyu/contracts';

/**
 * 商品字段标准化解析器（PROC-001）
 *
 * 把 RawProductEvent 转换为统一 NormalizedProduct：
 * - 防御性校验：非法价格、缺失链接、缺少来源 ID 直接拒绝（事件契约之外的兜底）。
 * - 标题清理：折叠空白（含全角空格）、去除首尾；normalized_title 小写化供匹配。
 * - 金额/运费/地区/成色/发布时间透传（事件契约已保证整数分与 ISO 时间）。
 * - 保留原始标题与原始价格文本（来自 raw_payload）用于审计。
 * 纯函数，不依赖数据库与队列。
 */

export type RejectionReason =
  'INVALID_PRICE' | 'MISSING_URL' | 'MISSING_SOURCE_PRODUCT_ID' | 'INVALID_TITLE';

export type NormalizeResult =
  { ok: true; product: NormalizedProduct } | { ok: false; reason: RejectionReason };

/** 折叠空白（含全角空格）为单个半角空格并去除首尾 */
export function collapseWhitespace(text: string): string {
  return text.replace(/[\s\u3000]+/g, ' ').trim();
}

/** 归一化标题：折叠空白 + 小写（与监控关键词 normalizeKeyword 对齐） */
export function normalizeTitle(title: string): string {
  return collapseWhitespace(title).toLowerCase();
}

/** 从 raw_payload 尽力提取原始价格文本（结构未知，容错返回 null） */
function extractPriceText(payload: unknown): string | null {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  const candidates = ['price', 'priceText', 'rawPrice', 'price_text'];
  for (const key of candidates) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return null;
}

export function normalizeProduct(event: RawProductEvent): NormalizeResult {
  const { product } = event;

  // 防御性校验（契约之外的外部事件兜底）
  if (!Number.isInteger(product.price_cent) || product.price_cent < 0) {
    return { ok: false, reason: 'INVALID_PRICE' };
  }
  if (!product.url || product.url.trim() === '') {
    return { ok: false, reason: 'MISSING_URL' };
  }
  if (!product.source_product_id || product.source_product_id.trim() === '') {
    return { ok: false, reason: 'MISSING_SOURCE_PRODUCT_ID' };
  }

  const title = collapseWhitespace(product.title);
  if (title === '') {
    return { ok: false, reason: 'INVALID_TITLE' };
  }

  const warnings: string[] = [];
  if (title !== product.title) {
    warnings.push('title_whitespace_normalized');
  }
  if (/[【】[\]<>]/.test(title)) {
    warnings.push('title_contains_marketing_symbols');
  }

  return {
    ok: true,
    product: {
      canonical_key: `${event.source}:${product.source_product_id}`,
      source: event.source,
      source_product_id: product.source_product_id,
      title,
      normalized_title: normalizeTitle(title),
      url: product.url,
      seller_id_hash: product.seller_id_hash,
      price_cent: product.price_cent,
      currency: product.currency,
      shipping_fee_cent: product.shipping_fee_cent,
      condition: product.condition,
      location: product.location,
      published_at: product.published_at,
      normalized_at: new Date().toISOString(),
      original_title: product.title,
      original_price_text: extractPriceText(product.raw_payload),
      warnings,
    },
  };
}
