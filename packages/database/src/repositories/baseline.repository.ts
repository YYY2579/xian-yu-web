import type { PrismaClient } from '@prisma/client';

/**
 * 可比样本查询（PRI-001）
 * 按关键词（normalized_title 包含）与近 N 天活跃窗口查询商品当前价，
 * 作为市场价基线样本。默认近 7 天、最多 500 条。
 */

export type ComparablePriceQuery = {
  /** 查询关键词（将小写化后匹配 normalized_title） */
  keyword: string;
  /** 活跃窗口天数（默认 7） */
  days?: number;
  /** 排除某个商品（计算该商品是否低价时排除自身） */
  excludeProductId?: string;
  /** 样本上限（默认 500） */
  limit?: number;
};

export class BaselineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 查询可比样本当前价（整数分，bigint） */
  async findComparablePrices(query: ComparablePriceQuery): Promise<bigint[]> {
    const days = query.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.product.findMany({
      where: {
        normalizedTitle: { contains: query.keyword.toLowerCase() },
        lastSeenAt: { gte: since },
        ...(query.excludeProductId ? { id: { not: query.excludeProductId } } : {}),
      },
      select: { currentPriceCent: true },
      take: Math.min(1000, Math.max(1, Math.trunc(query.limit ?? 500))),
    });
    return rows.map((r) => r.currentPriceCent);
  }
}
