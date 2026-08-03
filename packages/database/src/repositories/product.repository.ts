import { Prisma, type PrismaClient, type Product } from '@prisma/client';

/**
 * 商品仓储（DB-003）
 * - canonical_key（source + source_product_id）唯一，重复采集 upsert 只更新不新建。
 * - raw_payload（数据源原始载荷）默认查询不返回（访问边界），仅内部审计方法可取。
 * - 金额一律整数分。
 */

export type UpsertProductInput = {
  source: string;
  sourceProductId: string;
  /** 覆盖 canonical_key（无稳定 ID 时用受控指纹）；默认 source:sourceProductId */
  canonicalKey?: string;
  title: string;
  normalizedTitle: string;
  url: string;
  currentPriceCent: number | bigint;
  sellerIdHash?: string | null;
  currency?: string;
  condition?: string | null;
  location?: string | null;
  publishedAt?: Date | null;
  rawPayload?: Prisma.InputJsonValue | null;
};

/** 去重键：source + source_product_id */
export function buildCanonicalKey(source: string, sourceProductId: string): string {
  return `${source}:${sourceProductId}`;
}

/** 默认查询字段（排除 raw_payload，保证访问边界） */
const DEFAULT_SELECT = {
  id: true,
  source: true,
  sourceProductId: true,
  canonicalKey: true,
  title: true,
  normalizedTitle: true,
  url: true,
  sellerIdHash: true,
  currentPriceCent: true,
  currency: true,
  condition: true,
  location: true,
  publishedAt: true,
  firstSeenAt: true,
  lastSeenAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

export type ProductWithoutRawPayload = Prisma.ProductGetPayload<{ select: typeof DEFAULT_SELECT }>;

export class ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 按 canonical_key upsert：重复采集只更新当前字段与 lastSeenAt（原子 ON CONFLICT） */
  async upsert(input: UpsertProductInput): Promise<Product> {
    const canonicalKey =
      input.canonicalKey ?? buildCanonicalKey(input.source, input.sourceProductId);
    const lastSeenAt = new Date();
    return this.prisma.product.upsert({
      where: { canonicalKey },
      create: {
        ...input,
        canonicalKey,
        lastSeenAt,
        rawPayload:
          input.rawPayload === undefined || input.rawPayload === null
            ? Prisma.JsonNull
            : input.rawPayload,
      },
      update: {
        title: input.title,
        normalizedTitle: input.normalizedTitle,
        url: input.url,
        currentPriceCent: input.currentPriceCent,
        sellerIdHash: input.sellerIdHash ?? null,
        currency: input.currency ?? undefined,
        condition: input.condition ?? null,
        location: input.location ?? null,
        publishedAt: input.publishedAt ?? null,
        rawPayload: input.rawPayload ?? Prisma.JsonNull,
        lastSeenAt,
      },
    });
  }

  async findById(id: string): Promise<ProductWithoutRawPayload | null> {
    return this.prisma.product.findUnique({ where: { id }, select: DEFAULT_SELECT });
  }

  async findByCanonicalKey(canonicalKey: string): Promise<ProductWithoutRawPayload | null> {
    return this.prisma.product.findUnique({ where: { canonicalKey }, select: DEFAULT_SELECT });
  }

  /** 内部审计用：含 raw_payload（默认查询不可见） */
  async findWithRawPayload(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }
}
