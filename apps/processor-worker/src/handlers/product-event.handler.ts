import type { ProductObservedEvent, RawProductEvent } from '@xianyu/contracts';
import { applyNonTradeFilter, type FilterRejectReason } from '@xianyu/pricing-engine';
import { normalizeProduct, type ProductDeduplicator, type RejectionReason } from '../index';
import type { PriceHistoryHandler } from './price-history.handler';

/**
 * 商品事件编排 handler（PROC-005）
 * 串联：RawProductEvent -> normalize -> 非交易过滤 -> 去重 -> 价格历史 -> ProductObservedEvent。
 * - 清洗失败（校验拒绝）与非交易过滤命中：明确原因，不可重试（可 ACK 丢弃并记录）。
 * - 数据库瞬断等可重试错误：抛出，由队列层 NACK(requeue)。
 */

export type ProductEventDeps = {
  dedupe: ProductDeduplicator;
  priceHistory: PriceHistoryHandler;
};

export type ProcessOutcome =
  | { status: 'processed'; observed: ProductObservedEvent; productId: string; created: boolean }
  | { status: 'rejected'; reason: RejectionReason }
  | { status: 'filtered'; reason: FilterRejectReason };

export class ProductEventHandler {
  constructor(private readonly deps: ProductEventDeps) {}

  /** 处理一条原始商品事件；返回明确结局（失败原因可审计，不静默丢弃） */
  async process(event: RawProductEvent): Promise<ProcessOutcome> {
    // 1. 字段标准化（校验失败 -> 拒绝）
    const normalized = normalizeProduct(event);
    if (!normalized.ok) {
      return { status: 'rejected', reason: normalized.reason };
    }
    const product = normalized.product;

    // 2. 非交易过滤（求购/租赁/定金/配件等 -> 过滤）
    const filter = applyNonTradeFilter({
      title: product.title,
      normalizedTitle: product.normalized_title,
    });
    if (!filter.accepted) {
      return { status: 'filtered', reason: filter.reason };
    }

    // 3. 去重与主记录更新
    const dedup = await this.deps.dedupe.process(product);

    // 4. 价格历史（幂等）并产出观察事件
    const { observed } = await this.deps.priceHistory.handle(event, dedup.productId, product);

    return { status: 'processed', observed, productId: dedup.productId, created: dedup.created };
  }
}
