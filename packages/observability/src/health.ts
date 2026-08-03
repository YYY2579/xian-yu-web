/**
 * 健康检查（FND-006）
 * - 区分应用自身与外部依赖（数据库/Redis/队列/数据源）的状态。
 * - 依赖异常不导致整体 down（应用可降级运行），但必须明确上报。
 */

export type DependencyStatus = 'ok' | 'degraded' | 'down';

export type DependencyCheck = {
  name: string;
  status: DependencyStatus;
  detail?: string;
  latencyMs?: number;
};

export type HealthReport = {
  status: DependencyStatus;
  checks: DependencyCheck[];
  checkedAt: string;
};

/** 聚合规则：任一 down → down；否则任一 degraded → degraded；全 ok → ok */
export function aggregateHealth(checks: DependencyCheck[]): HealthReport {
  const status: DependencyStatus = checks.some((c) => c.status === 'down')
    ? 'down'
    : checks.some((c) => c.status === 'degraded')
      ? 'degraded'
      : 'ok';
  return { status, checks, checkedAt: new Date().toISOString() };
}

/** 便捷构造单个依赖检查结果 */
export function dependencyCheck(
  name: string,
  ok: boolean,
  options?: { detail?: string; latencyMs?: number },
): DependencyCheck {
  return {
    name,
    status: ok ? 'ok' : 'down',
    detail: options?.detail,
    latencyMs: options?.latencyMs,
  };
}
