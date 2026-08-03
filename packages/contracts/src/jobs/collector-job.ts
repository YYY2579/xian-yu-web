/**
 * CollectorJob（COL-003）
 * 调度器 -> 采集 worker 的任务消息：选择到期监控任务 + 分布式锁 + 配额检查后产出。
 * 实际入队（RabbitMQ/BullMQ）由 queue 包在 COL-004 实现，本类型为契约。
 */

export type CollectorJob = {
  /** 任务实例 ID（UUID v4） */
  job_id: string;
  monitor_id: string;
  keyword: string;
  /** 数据源标识（与 DatasourceAdapter.source 对应） */
  source: string;
  /** 计划执行时间（ISO 8601 带时区） */
  scheduled_for: string;
  /** 优先级（越小越优先，默认 100） */
  priority: number;
  /** 第几次尝试（重试递增） */
  attempt: number;
};
