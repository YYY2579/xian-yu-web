import { Counter, Histogram, Registry } from 'prom-client';

/**
 * 指标注册表（FND-006）
 * 基于 prom-client 的轻量封装：统一 registry，按名称复用指标实例。
 * 导出的 Prometheus 文本格式可直接被采集器抓取。
 */

export type MetricLabelValues = Record<string, string | number>;

export class MetricsRegistry {
  private readonly registry = new Registry();
  private readonly counters = new Map<string, Counter<string>>();
  private readonly histograms = new Map<string, Histogram<string>>();

  counter(name: string, help: string): Counter<string> {
    const existing = this.counters.get(name);
    if (existing) return existing;
    const counter = new Counter({ name, help, registers: [this.registry] });
    this.counters.set(name, counter);
    return counter;
  }

  histogram(name: string, help: string, buckets?: number[]): Histogram<string> {
    const existing = this.histograms.get(name);
    if (existing) return existing;
    const histogram = new Histogram({
      name,
      help,
      buckets,
      registers: [this.registry],
    });
    this.histograms.set(name, histogram);
    return histogram;
  }

  /** 输出 Prometheus 文本格式 */
  async snapshot(): Promise<string> {
    return this.registry.metrics();
  }

  reset(): void {
    this.registry.resetMetrics();
  }
}

/** 常用业务指标名（采集成功率、任务耗时、通知成功率等） */
export const MetricNames = {
  COLLECT_SUCCESS_TOTAL: 'xianyu_collect_success_total',
  COLLECT_FAILURE_TOTAL: 'xianyu_collect_failure_total',
  PROCESSED_EVENTS_TOTAL: 'xianyu_processed_events_total',
  NOTIFICATION_SENT_TOTAL: 'xianyu_notification_sent_total',
  NOTIFICATION_FAILED_TOTAL: 'xianyu_notification_failed_total',
  COLLECT_DURATION_SECONDS: 'xianyu_collect_duration_seconds',
  QUEUE_CONSUME_DURATION_SECONDS: 'xianyu_queue_consume_duration_seconds',
} as const;
