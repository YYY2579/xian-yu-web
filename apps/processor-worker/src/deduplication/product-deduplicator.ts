import { createHash } from 'node:crypto';
import type { NormalizedProduct } from '@xianyu/contracts';
import type { ProductRepository } from '@xianyu/database';

/**
 * 商品去重器（PROC-003）
 * - 优先使用 source + source_product_id 作为去重键（canonical_key）。
 * - 无稳定来源 ID 时使用受控指纹（normalized_title + price + seller_id_hash 的 SHA-256）。
 * - 底层 ProductRepository.upsert 原子 ON CONFLICT，并发不产生重复主记录。
 * - 返回 created 标志（更新 vs 新建，用于统计与审计）。
 */

export type DedupResult = {
  productId: string;
  created: boolean;
  canonicalKey: string;
};

export class ProductDeduplicator {
  constructor(private readonly products: ProductRepository) {}

  /** 受控指纹：稳定商品特征（标题 + 卖家 + 地区）；价格变化不影响指纹 */
  static fingerprint(normalized: NormalizedProduct): string {
    return createHash('sha256')
      .update(
        `${normalized.normalized_title}|${normalized.seller_id_hash ?? ''}|${normalized.location ?? ''}`,
      )
      .digest('hex')
      .slice(0, 16);
  }

  /** 去重键：有稳定来源 ID 用 source:id，否则用指纹 */
  static buildKey(normalized: NormalizedProduct): string {
    const sourceProductId = normalized.source_product_id.trim();
    return sourceProductId !== ''
      ? `${normalized.source}:${sourceProductId}`
      : `fp:${ProductDeduplicator.fingerprint(normalized)}`;
  }

  /** 处理一条标准化商品：新增或更新主记录 */
  async process(normalized: NormalizedProduct): Promise<DedupResult> {
    const canonicalKey = ProductDeduplicator.buildKey(normalized);
    const existing = await this.products.findByCanonicalKey(canonicalKey);

    const product = await this.products.upsert({
      source: normalized.source,
      sourceProductId: normalized.source_product_id,
      canonicalKey,
      title: normalized.title,
      normalizedTitle: normalized.normalized_title,
      url: normalized.url,
      currentPriceCent: normalized.price_cent,
      sellerIdHash: normalized.seller_id_hash,
      currency: normalized.currency,
      condition: normalized.condition,
      location: normalized.location,
      publishedAt: normalized.published_at ? new Date(normalized.published_at) : null,
      rawPayload: undefined,
    });

    return { productId: product.id, created: existing === null, canonicalKey };
  }
}
