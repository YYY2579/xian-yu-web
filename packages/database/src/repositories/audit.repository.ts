import type { AuditLog, Prisma, PrismaClient } from '@prisma/client';

/**
 * 审计日志仓储（DB-004）
 * 只支持追加（create）与只读查询（list）；不提供 update/delete，
 * 普通用户 API 无法修改审计记录（权限隔离由 API 层再叠加用户校验）。
 */

export type CreateAuditInput = {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  detail?: Prisma.InputJsonValue;
  ip?: string;
};

export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateAuditInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        detail: input.detail,
        ip: input.ip ?? null,
      },
    });
  }

  /** 只读查询：可按操作者/资源类型过滤 */
  async list(options?: {
    actorId?: string;
    resourceType?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: {
        actorId: options?.actorId,
        resourceType: options?.resourceType,
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ? Math.min(500, Math.trunc(options.limit)) : undefined,
    });
  }
}
