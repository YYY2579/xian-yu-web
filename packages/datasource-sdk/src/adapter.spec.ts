import { createRawProductEvent, iphoneFixtureInput, type RawProductEvent } from '@xianyu/contracts';
import { describe, expect, it } from 'vitest';
import {
  type DatasourceAdapter,
  DatasourceError,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SEARCH_TIMEOUT_MS,
  type HealthStatus,
  type SearchQuery,
  type SearchResult,
} from './index';

/** mock 适配器：验证接口可被实现，且只输出 RawProductEvent */
class MockAdapter implements DatasourceAdapter {
  readonly source = 'mock-source';

  async search(query: SearchQuery): Promise<SearchResult> {
    const product: RawProductEvent = createRawProductEvent({
      ...iphoneFixtureInput,
      monitor_id: query.monitorId,
      keyword: query.keyword,
    });
    return {
      source: this.source,
      query,
      products: [product],
      collectedAt: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    return { ok: true, checkedAt: new Date().toISOString() };
  }

  async close(): Promise<void> {}
}

describe('DatasourceAdapter 接口', () => {
  it('mock 适配器可实现接口并返回合法 RawProductEvent', async () => {
    const adapter = new MockAdapter();
    const query: SearchQuery = { monitorId: 'm-1', keyword: 'iPhone 15 Pro', limit: 10 };
    const result = await adapter.search(query);

    expect(result.source).toBe('mock-source');
    expect(result.query.keyword).toBe('iPhone 15 Pro');
    expect(result.products).toHaveLength(1);
    expect(result.products[0]!.schema_version).toBe(1);
    expect(result.products[0]!.monitor_id).toBe('m-1');
    expect(Date.parse(result.collectedAt)).not.toBeNaN();

    const health = await adapter.healthCheck();
    expect(health.ok).toBe(true);
    await adapter.close();
  });
});

describe('DatasourceError', () => {
  it('限流/超时/服务端错误默认可重试，其余默认不可重试', () => {
    expect(new DatasourceError('rate_limited', 'too many').retryable).toBe(true);
    expect(new DatasourceError('timeout', 'slow').retryable).toBe(true);
    expect(new DatasourceError('server_error', '500').retryable).toBe(true);
    expect(new DatasourceError('auth', '401').retryable).toBe(false);
    expect(new DatasourceError('invalid_response', 'parse fail').retryable).toBe(false);
    expect(new DatasourceError('not_found', 'no result').retryable).toBe(false);
    expect(new DatasourceError('unknown', '?').retryable).toBe(false);
  });

  it('可显式覆盖 retryable', () => {
    const err = new DatasourceError('auth', 'manual retry', { retryable: true });
    expect(err.retryable).toBe(true);
    expect(err.category).toBe('auth');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('默认常量', () => {
  it('搜索超时与条数上限', () => {
    expect(DEFAULT_SEARCH_TIMEOUT_MS).toBe(30_000);
    expect(DEFAULT_SEARCH_LIMIT).toBe(50);
  });
});
