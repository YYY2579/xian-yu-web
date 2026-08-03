import type { PrismaClient, ProductPriceHistory } from '@prisma/client';

/**
 * 价格历史仓储（DB-003）
 * - source_event_id 唯一 → 同一事件重复消费不产生重复历史行（幂等，record 返回 null 表示跳过）。
 * - 查询按商品 + 时间范围（observed_at）倒序；按月分区在 Phase 2（DB-005）落地。
 */

export type RecordPriceInput = {
  productId: string;
  priceCent: number | bigint;
  shippingFeeCent?: number | bigint | null;
  observedAt: Date;
  /** 来源事件 ID（RawProductEvent.event_id），用于幂等 */
  sourceEventId?: string;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export class PriceHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 幂等写入：source_event_id 冲突时跳过并返回 null（已存在） */
  async record(input: RecordPriceInput): Promise<ProductPriceHistory | null> {
    try {
      return await this.prisma.productPriceHistory.create({
        data: {
          productId: input.productId,
          priceCent: input.priceCent,
          shippingFeeCent: input.shippingFeeCent ?? null,
          observedAt: input.observedAt,
          sourceEventId: input.sourceEventId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return null; // 重复事件幂等跳过
      throw err;
    }
  }

  /** 按商品与时间范围查询，observed_at 倒序（最新在前） */
  async listByProduct(
    productId: string,
    options?: { from?: Date; to?: Date; limit?: number },
  ): Promise<ProductPriceHistory[]> {
    return this.prisma.productPriceHistory.findMany({
      where: {
        productId,
        observedAt: {
          gte: options?.from,
          lte: options?.to,
        },
      },
      orderBy: { observedAt: 'desc' },
      take: options?.limit ? Math.min(1000, Math.trunc(options.limit)) : undefined,
    });
  }
}
