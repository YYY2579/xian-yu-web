import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationView, PricePointView, ProductView } from '@xianyu/contracts';
import {
  NotificationRepository,
  PriceHistoryRepository,
  ProductRepository,
} from '@xianyu/database';

/**
 * 商品/价格历史/通知查询服务（API-004）
 * - 商品与价格历史公开查询（不含 raw_payload）。
 * - 通知记录按用户隔离（listByUser）。
 */

@Injectable()
export class ProductsService {
  constructor(
    @Inject(ProductRepository) private readonly products: ProductRepository,
    @Inject(PriceHistoryRepository) private readonly priceHistory: PriceHistoryRepository,
    @Inject(NotificationRepository) private readonly notificationsRepo: NotificationRepository,
  ) {}

  async list(keyword: string, page: number, pageSize: number) {
    const result = await this.products.findByKeywordPaginated(keyword, page, pageSize);
    return {
      items: result.items.map((p) => this.toProductView(p)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async get(id: string): Promise<ProductView> {
    const product = await this.products.findById(id);
    if (!product) throw new NotFoundException('product not found');
    return this.toProductView(product);
  }

  async prices(id: string): Promise<PricePointView[]> {
    const rows = await this.priceHistory.listByProduct(id, { limit: 200 });
    return rows.map((r) => ({
      id: Number(r.id),
      priceCent: Number(r.priceCent),
      shippingFeeCent: r.shippingFeeCent === null ? null : Number(r.shippingFeeCent),
      observedAt: r.observedAt.toISOString(),
    }));
  }

  async notifications(userId: string, page: number, pageSize: number) {
    const result = await this.notificationsRepo.listByUser(userId, page, pageSize);
    return {
      items: result.items.map((n) => this.toNotificationView(n)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  private toProductView(p: {
    id: string;
    source: string;
    sourceProductId: string;
    canonicalKey: string;
    title: string;
    normalizedTitle: string;
    url: string;
    currentPriceCent: bigint;
    currency: string;
    condition: string | null;
    location: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
  }): ProductView {
    return {
      id: p.id,
      source: p.source,
      sourceProductId: p.sourceProductId,
      canonicalKey: p.canonicalKey,
      title: p.title,
      normalizedTitle: p.normalizedTitle,
      url: p.url,
      currentPriceCent: Number(p.currentPriceCent),
      currency: p.currency,
      condition: p.condition,
      location: p.location,
      firstSeenAt: p.firstSeenAt.toISOString(),
      lastSeenAt: p.lastSeenAt.toISOString(),
    };
  }

  private toNotificationView(n: {
    id: string;
    channel: string;
    eventType: string;
    ruleVersion: string;
    productPriceCent: bigint;
    marketPriceCent: bigint | null;
    discountRate: unknown;
    deliveryStatus: string;
    retryCount: number;
    createdAt: Date;
  }): NotificationView {
    return {
      id: n.id,
      channel: n.channel,
      eventType: n.eventType,
      ruleVersion: n.ruleVersion,
      productPriceCent: Number(n.productPriceCent),
      marketPriceCent: n.marketPriceCent === null ? null : Number(n.marketPriceCent),
      discountRate: n.discountRate === null ? null : Number(n.discountRate),
      deliveryStatus: n.deliveryStatus,
      retryCount: n.retryCount,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
