import { randomUUID } from 'node:crypto';
import {
  type NormalizedProduct,
  PRODUCT_OBSERVED_EVENT_SCHEMA_VERSION,
  type ProductObservedEvent,
  type RawProductEvent,
} from '@xianyu/contracts';
import type { PriceHistoryRepository, ProductRepository } from '@xianyu/database';

/**
 * 价格历史写入 handler（PROC-004）
 * - 以 RawProductEvent.event_id（source_event_id）幂等：重复消费不产生重复历史行。
 * - 幂等即补偿策略：商品 upsert 与价格历史写入各自幂等，无需跨表事务。
 * - 产出 ProductObservedEvent 供分析服务消费（实际入队由 PROC-005 实现）。
 */

export type PriceHistoryDeps = {
  products: ProductRepository;
  priceHistory: PriceHistoryRepository;
};

export type PriceHistoryHandleResult = {
  /** 是否新写入一条历史（重复事件返回 false） */
  recorded: boolean;
  observed: ProductObservedEvent;
};

export class PriceHistoryHandler {
  constructor(private readonly deps: PriceHistoryDeps) {}

  /**
   * 写入价格历史并产出观察事件。
   * @param event    原始事件（occurred_at 作为观察时间，event_id 作为幂等键）
   * @param productId 去重后的商品主记录 ID
   * @param normalized 标准化商品（价格/来源/关键词等）
   */
  async handle(
    event: RawProductEvent,
    productId: string,
    normalized: NormalizedProduct,
  ): Promise<PriceHistoryHandleResult> {
    const recorded = await this.deps.priceHistory.record({
      productId,
      priceCent: event.product.price_cent,
      shippingFeeCent: event.product.shipping_fee_cent,
      observedAt: new Date(event.occurred_at),
      sourceEventId: event.event_id,
    });

    const observed: ProductObservedEvent = {
      event_id: randomUUID(),
      schema_version: PRODUCT_OBSERVED_EVENT_SCHEMA_VERSION,
      observed_at: event.occurred_at,
      product_id: productId,
      canonical_key: normalized.canonical_key,
      source: normalized.source,
      source_product_id: normalized.source_product_id,
      price_cent: normalized.price_cent,
      currency: normalized.currency,
      monitor_id: event.monitor_id,
      keyword: event.keyword,
    };

    return { recorded: recorded !== null, observed };
  }
}
