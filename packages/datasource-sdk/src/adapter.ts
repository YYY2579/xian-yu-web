import type { RawProductEvent } from '@xianyu/contracts';

/**
 * 数据源适配器接口（COL-001 / ADR-005）
 *
 * 约束：
 * - 适配器只输出 RawProductEvent，不得直接写业务数据库、做价格判断或发送通知。
 * - 浏览器执行层（如 Playwright）必须封装在适配器内部；上层业务不感知页面结构。
 * - 错误必须分类（auth/rate_limited/timeout/...），retryable 决定调度器是否重试。
 */

export type SearchFilters = {
  categoryCode?: string;
  /** 最高价过滤（整数分） */
  maxPriceCent?: number;
  excludeKeywords?: string[];
  location?: string;
};

export type SearchQuery = {
  /** 触发采集的监控任务 ID */
  monitorId: string;
  keyword: string;
  filters?: SearchFilters;
  /** 期望返回条数上限 */
  limit?: number;
};

export type SearchResult = {
  source: string;
  query: SearchQuery;
  products: RawProductEvent[];
  /** 采集完成时间（ISO 8601 带时区） */
  collectedAt: string;
};

export type HealthStatus = {
  ok: boolean;
  checkedAt: string;
  detail?: string;
};

export type ErrorCategory =
  | 'auth' // 凭据失效/未授权
  | 'rate_limited' // 数据源限流
  | 'timeout' // 超时
  | 'not_found' // 关键词无结果或页面不存在
  | 'server_error' // 数据源 5xx
  | 'invalid_response' // 响应无法解析
  | 'unknown';

/** 可重试的错误分类（限流/超时/服务端错误）；其他分类默认不可重试。 */
const RETRYABLE_CATEGORIES: readonly ErrorCategory[] = ['rate_limited', 'timeout', 'server_error'];

export class DatasourceError extends Error {
  readonly category: ErrorCategory;
  readonly retryable: boolean;

  constructor(category: ErrorCategory, message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = 'DatasourceError';
    this.category = category;
    this.retryable = options?.retryable ?? RETRYABLE_CATEGORIES.includes(category);
  }
}

export interface DatasourceAdapter {
  /** 数据源标识（与 RawProductEvent.source 一致） */
  readonly source: string;

  search(query: SearchQuery, options?: { timeoutMs?: number }): Promise<SearchResult>;

  healthCheck(): Promise<HealthStatus>;

  close(): Promise<void>;
}

export const DEFAULT_SEARCH_TIMEOUT_MS = 30_000;
export const DEFAULT_SEARCH_LIMIT = 50;
