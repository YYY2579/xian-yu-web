import { type KeywordMonitor, type MonitorStatus, Prisma, type PrismaClient } from '@prisma/client';

/**
 * 监控任务仓储（DB-002）
 * - 金额一律整数分（targetPriceCent）；阈值 DECIMAL(5,4)（默认 0.7）。
 * - 频率/阈值/样本量/金额的范围校验在本层执行（MonitorValidationError）。
 * - 创建/恢复时生成 nextRunAt；暂停后调度器不再选中（status=PAUSED）。
 */

export const MIN_FREQUENCY_MINUTES = 1;
export const MAX_FREQUENCY_MINUTES = 10_080; // 7 天
export const DEFAULT_MIN_SAMPLE_SIZE = 10;
export const DEFAULT_DISCOUNT_THRESHOLD = 0.7;

export type CreateMonitorInput = {
  userId: string;
  keyword: string;
  targetPriceCent: number | bigint;
  /** 相对市场价折扣阈值，范围 (0, 1]，默认 0.7 */
  discountThreshold?: number | string;
  /** 最少可比样本数，默认 10 */
  minSampleSize?: number;
  /** 采集频率（分钟），范围 [1, 10080] */
  frequencyMinutes: number;
  categoryCode?: string;
  filters?: Prisma.InputJsonValue;
  notifyChannels?: Prisma.InputJsonValue;
};

export type UpdateMonitorInput = Partial<{
  keyword: string;
  categoryCode: string | null;
  targetPriceCent: number | bigint;
  discountThreshold: number | string;
  minSampleSize: number;
  frequencyMinutes: number;
  filters: Prisma.InputJsonValue;
  notifyChannels: Prisma.InputJsonValue;
}>;

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export class MonitorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MonitorValidationError';
  }
}

/** 关键词归一化：去首尾空白、全角/连续空白折叠为半角空格、小写。 */
export function normalizeKeyword(keyword: string): string {
  return keyword
    .trim()
    .replace(/[\s\u3000]+/g, ' ')
    .toLowerCase();
}

function assertNonNegativePrice(value: number | bigint): void {
  const ok = typeof value === 'bigint' ? value >= 0n : Number.isSafeInteger(value) && value >= 0;
  if (!ok) throw new MonitorValidationError('targetPriceCent must be a non-negative integer');
}

function assertDiscount(value: number | string): void {
  const d = Number(value);
  if (!Number.isFinite(d) || d <= 0 || d > 1) {
    throw new MonitorValidationError('discountThreshold must be in (0, 1]');
  }
}

function assertFrequency(value: number): void {
  if (!Number.isInteger(value) || value < MIN_FREQUENCY_MINUTES || value > MAX_FREQUENCY_MINUTES) {
    throw new MonitorValidationError(
      `frequencyMinutes must be an integer in [${MIN_FREQUENCY_MINUTES}, ${MAX_FREQUENCY_MINUTES}]`,
    );
  }
}

function assertSampleSize(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new MonitorValidationError('minSampleSize must be a positive integer');
  }
}

export class MonitorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateMonitorInput): Promise<KeywordMonitor> {
    assertNonNegativePrice(input.targetPriceCent);
    assertDiscount(input.discountThreshold ?? DEFAULT_DISCOUNT_THRESHOLD);
    assertFrequency(input.frequencyMinutes);
    assertSampleSize(input.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE);

    const nextRunAt = new Date(Date.now() + input.frequencyMinutes * 60_000);
    return this.prisma.keywordMonitor.create({
      data: {
        userId: input.userId,
        keyword: input.keyword,
        normalizedKeyword: normalizeKeyword(input.keyword),
        targetPriceCent: input.targetPriceCent,
        discountThreshold: new Prisma.Decimal(
          input.discountThreshold ?? DEFAULT_DISCOUNT_THRESHOLD,
        ).toFixed(4),
        minSampleSize: input.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE,
        frequencyMinutes: input.frequencyMinutes,
        categoryCode: input.categoryCode,
        filters: input.filters,
        notifyChannels: input.notifyChannels,
        nextRunAt,
      },
    });
  }

  async findById(id: string): Promise<KeywordMonitor | null> {
    return this.prisma.keywordMonitor.findUnique({ where: { id } });
  }

  /** 按用户分页查询（按创建时间倒序） */
  async listByUser(userId: string, page = 1, pageSize = 20): Promise<Paged<KeywordMonitor>> {
    const safePage = Math.max(1, Math.trunc(page));
    const safeSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.keywordMonitor.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
      this.prisma.keywordMonitor.count({ where }),
    ]);
    return { items, total, page: safePage, pageSize: safeSize };
  }

  async update(id: string, input: UpdateMonitorInput): Promise<KeywordMonitor> {
    if (input.keyword !== undefined && input.keyword.trim() === '') {
      throw new MonitorValidationError('keyword must not be empty');
    }
    if (input.targetPriceCent !== undefined) assertNonNegativePrice(input.targetPriceCent);
    if (input.discountThreshold !== undefined) assertDiscount(input.discountThreshold);
    if (input.frequencyMinutes !== undefined) assertFrequency(input.frequencyMinutes);
    if (input.minSampleSize !== undefined) assertSampleSize(input.minSampleSize);

    const data: Prisma.KeywordMonitorUpdateInput = {};
    if (input.keyword !== undefined) {
      data.keyword = input.keyword;
      data.normalizedKeyword = normalizeKeyword(input.keyword);
    }
    if (input.categoryCode !== undefined) data.categoryCode = input.categoryCode;
    if (input.targetPriceCent !== undefined) data.targetPriceCent = input.targetPriceCent;
    if (input.discountThreshold !== undefined) {
      data.discountThreshold = new Prisma.Decimal(input.discountThreshold).toFixed(4);
    }
    if (input.minSampleSize !== undefined) data.minSampleSize = input.minSampleSize;
    if (input.frequencyMinutes !== undefined) data.frequencyMinutes = input.frequencyMinutes;
    if (input.filters !== undefined) data.filters = input.filters;
    if (input.notifyChannels !== undefined) data.notifyChannels = input.notifyChannels;

    return this.prisma.keywordMonitor.update({ where: { id }, data });
  }

  /** 暂停：调度器不再选中该任务 */
  async pause(id: string): Promise<KeywordMonitor> {
    return this.prisma.keywordMonitor.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  /** 恢复：置 ACTIVE 并重新生成 nextRunAt */
  async resume(id: string): Promise<KeywordMonitor> {
    const current = await this.findById(id);
    if (!current) throw new Error(`monitor ${id} not found`);
    const nextRunAt = new Date(Date.now() + current.frequencyMinutes * 60_000);
    return this.prisma.keywordMonitor.update({
      where: { id },
      data: { status: 'ACTIVE', nextRunAt },
    });
  }

  /** 按状态与到期时间查询（调度器用，status 默认 ACTIVE） */
  async findByDue(
    dueBefore: Date,
    status: MonitorStatus = 'ACTIVE',
    limit = 50,
  ): Promise<KeywordMonitor[]> {
    return this.prisma.keywordMonitor.findMany({
      where: { status, nextRunAt: { lte: dueBefore } },
      orderBy: { nextRunAt: 'asc' },
      take: Math.min(500, Math.max(1, Math.trunc(limit))),
    });
  }
}
