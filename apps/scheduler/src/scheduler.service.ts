import { randomUUID } from 'node:crypto';
import type { CollectorJob } from '@xianyu/contracts';
import type { MonitorRepository } from '@xianyu/database';
import type { DistributedLock } from './locks';
import type { QuotaManager } from './quota';

/**
 * 调度服务（COL-003）
 * 单个调度周期：
 * 1. 按 next_run_at 选择到期启用任务（MonitorRepository.findByDue）。
 * 2. 分布式锁：同一监控任务多实例只允许一个执行（锁 TTL 防死锁）。
 * 3. 数据源配额检查：超配额任务本次跳过（延期而非丢失，nextRunAt 不变）。
 * 4. 产出 CollectorJob 消息（入队由 COL-004 的 queue 包实现）。
 */

export type SchedulerDeps = {
  monitors: MonitorRepository;
  locks: DistributedLock;
  quota: QuotaManager;
};

export type SchedulerOptions = {
  /** 到期边界（默认 now） */
  dueBefore?: Date;
  /** 本次最多选出的任务数 */
  limit?: number;
  /** 监控任务锁 TTL（毫秒，默认 60s） */
  lockTtlMs?: number;
  /** 数据源配额配置；未提供则不做配额限制 */
  quota?: { source: string; windowSec: number; limit: number };
  /** 默认优先级（越小越优先） */
  priority?: number;
};

export type SkipReason = 'locked' | 'quota_exhausted';

export type SchedulerCycleResult = {
  jobs: CollectorJob[];
  skipped: { monitorId: string; reason: SkipReason }[];
};

export class SchedulerService {
  constructor(private readonly deps: SchedulerDeps) {}

  async runCycle(options: SchedulerOptions = {}): Promise<SchedulerCycleResult> {
    const dueBefore = options.dueBefore ?? new Date();
    const limit = options.limit ?? 50;
    const lockTtlMs = options.lockTtlMs ?? 60_000;
    const priority = options.priority ?? 100;
    const scheduledFor = new Date().toISOString();

    const due = await this.deps.monitors.findByDue(dueBefore, 'ACTIVE', limit);
    const jobs: CollectorJob[] = [];
    const skipped: SchedulerCycleResult['skipped'] = [];

    for (const monitor of due) {
      // 1. 分布式锁：同一任务不得并发执行
      const lock = await this.deps.locks.acquire(`monitor:${monitor.id}`, { ttlMs: lockTtlMs });
      if (lock === null) {
        skipped.push({ monitorId: monitor.id, reason: 'locked' });
        continue;
      }
      try {
        // 2. 数据源配额：超配额延期（不产出 job，下周期重试）
        if (options.quota) {
          const quota = await this.deps.quota.consume(options.quota.source, {
            windowSec: options.quota.windowSec,
            limit: options.quota.limit,
          });
          if (!quota.allowed) {
            skipped.push({ monitorId: monitor.id, reason: 'quota_exhausted' });
            continue;
          }
        }

        // 3. 产出采集任务
        jobs.push({
          job_id: randomUUID(),
          monitor_id: monitor.id,
          keyword: monitor.keyword,
          source: options.quota?.source ?? 'authorized-source',
          scheduled_for: scheduledFor,
          priority,
          attempt: 1,
        });
      } finally {
        // 调度周期结束释放锁（采集 worker 实际执行时锁由 worker 持有/续期）
        await this.deps.locks.release(`monitor:${monitor.id}`, lock.owner);
      }
    }

    return { jobs, skipped };
  }
}
