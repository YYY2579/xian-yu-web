import type { MonitorRun, MonitorRunStatus, PrismaClient } from '@prisma/client';

/**
 * 任务运行记录仓储（DB-004）
 * start -> finish（SUCCESS/FAILED），记录结果数、耗时与错误信息。
 */

export class RunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 开始一次任务执行 */
  async start(monitorId: string): Promise<MonitorRun> {
    return this.prisma.monitorRun.create({
      data: { monitorId, status: 'RUNNING' },
    });
  }

  /** 完成执行：成功或失败，记录指标与错误 */
  async finish(
    runId: number | bigint,
    result: {
      status: 'SUCCESS' | 'FAILED';
      resultCount?: number;
      errorMessage?: string;
      durationMs?: number;
    },
  ): Promise<MonitorRun> {
    return this.prisma.monitorRun.update({
      where: { id: runId },
      data: {
        status: result.status,
        resultCount: result.resultCount ?? 0,
        errorMessage: result.errorMessage ?? null,
        durationMs: result.durationMs ?? null,
        finishedAt: new Date(),
      },
    });
  }

  /** 按监控任务查询运行记录（倒序） */
  async listByMonitor(monitorId: string, page = 1, pageSize = 20): Promise<MonitorRun[]> {
    const safePage = Math.max(1, Math.trunc(page));
    const safeSize = Math.min(100, Math.max(1, Math.trunc(pageSize)));
    return this.prisma.monitorRun.findMany({
      where: { monitorId },
      orderBy: { startedAt: 'desc' },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    });
  }
}

// 保留枚举类型导出，便于调用方引用状态
export type { MonitorRunStatus };
