import {
  type NotificationDeliveryStatus,
  type NotificationRecord,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

/**
 * 通知记录仓储（DB-004）
 * - idempotency_key 唯一：同键重复插入被跳过（幂等），返回 null。
 * - delivery_status 驱动重试：PENDING -> SENT / FAILED（retry_count+1）-> DEAD；
 *   每次重试通过 markFailed 自增计数。
 */

export type CreateNotificationInput = {
  userId: string;
  monitorId: string;
  productId: string;
  channel: string;
  eventType: string;
  ruleVersion: string;
  productPriceCent: number | bigint;
  marketPriceCent?: number | bigint | null;
  discountRate?: number | string;
  reason?: Prisma.InputJsonValue;
  idempotencyKey: string;
};

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

export class NotificationAlreadyExistsError extends Error {
  constructor(idempotencyKey: string) {
    super(`notification with idempotency key ${idempotencyKey} already exists`);
    this.name = 'NotificationAlreadyExistsError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export class NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 幂等创建：相同 idempotency_key 已存在时抛 NotificationAlreadyExistsError。
   * 调用方按业务需要决定是跳过还是更新（如首次创建后返回）。
   */
  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    try {
      return await this.prisma.notificationRecord.create({
        data: {
          userId: input.userId,
          monitorId: input.monitorId,
          productId: input.productId,
          channel: input.channel,
          eventType: input.eventType,
          ruleVersion: input.ruleVersion,
          productPriceCent: input.productPriceCent,
          marketPriceCent: input.marketPriceCent ?? null,
          discountRate:
            input.discountRate !== undefined
              ? new Prisma.Decimal(input.discountRate).toFixed(4)
              : null,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new NotificationAlreadyExistsError(input.idempotencyKey);
      }
      throw err;
    }
  }

  /** 幂等查询：按 idempotency_key 获取已存在的通知（无则 null） */
  async findByKey(idempotencyKey: string): Promise<NotificationRecord | null> {
    return this.prisma.notificationRecord.findUnique({ where: { idempotencyKey } });
  }

  async findById(id: string): Promise<NotificationRecord | null> {
    return this.prisma.notificationRecord.findUnique({ where: { id } });
  }

  /** 按用户分页查询（按创建时间倒序） */
  async listByUser(userId: string, page = 1, pageSize = 20): Promise<Paged<NotificationRecord>> {
    const safePage = Math.max(1, Math.trunc(page));
    const safeSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
    const where = { userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
      this.prisma.notificationRecord.count({ where }),
    ]);
    return { items, total, page: safePage, pageSize: safeSize };
  }

  /** 标记发送成功 */
  async markSent(id: string, providerMessageId?: string): Promise<NotificationRecord> {
    return this.prisma.notificationRecord.update({
      where: { id },
      data: {
        deliveryStatus: 'SENT',
        providerMessageId,
        sentAt: new Date(),
      },
    });
  }

  /** 标记失败并自增重试计数 */
  async markFailed(id: string): Promise<NotificationRecord> {
    return this.prisma.notificationRecord.update({
      where: { id },
      data: {
        deliveryStatus: 'FAILED',
        retryCount: { increment: 1 },
      },
    });
  }

  /** 进入死信（永久失败，可人工重放） */
  async markDead(id: string): Promise<NotificationRecord> {
    return this.prisma.notificationRecord.update({
      where: { id },
      data: { deliveryStatus: 'DEAD' },
    });
  }

  /** 抑制（用户免打扰/达每日上限等策略） */
  async markSuppressed(id: string): Promise<NotificationRecord> {
    return this.prisma.notificationRecord.update({
      where: { id },
      data: { deliveryStatus: 'SUPPRESSED' },
    });
  }

  /** 按状态查询（notifier worker 拉取待发送/待重试） */
  async listByStatus(
    status: NotificationDeliveryStatus,
    limit = 50,
  ): Promise<NotificationRecord[]> {
    return this.prisma.notificationRecord.findMany({
      where: { deliveryStatus: status },
      orderBy: { createdAt: 'asc' },
      take: Math.min(500, Math.max(1, Math.trunc(limit))),
    });
  }
}
