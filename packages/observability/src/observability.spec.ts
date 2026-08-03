import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  aggregateHealth,
  createLogger,
  createTraceContext,
  dependencyCheck,
  deriveTraceContext,
  generateTraceId,
  MetricNames,
  MetricsRegistry,
  parseTraceparent,
} from './index';

/** 捕获 pino JSON 输出的可写流 */
function captureStream(): { stream: Writable; lines: string[] } {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines };
}

describe('createLogger', () => {
  it('输出 JSON 行且含 name/level/msg', async () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('test-service', { stream });
    logger.info('hello', { user: 'alice' });
    logger.error('boom', { code: 500 });

    const first = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(first.name).toBe('test-service');
    expect(first.level).toBe(30); // pino info
    expect(first.msg).toBe('hello');
    expect(first.user).toBe('alice');
    const second = JSON.parse(lines[1] ?? '') as Record<string, unknown>;
    expect(second.level).toBe(50); // pino error
    expect(second.msg).toBe('boom');
  });

  it('敏感字段任意层级脱敏，不泄漏凭据', async () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('test', { stream });
    logger.info('login', {
      user: 'alice',
      password: 'super-secret',
      nested: { token: 'tok-123', cookie: 'sid=abc', ok: true },
    });
    const raw = lines[0] ?? '';
    expect(raw).not.toContain('super-secret');
    expect(raw).not.toContain('tok-123');
    expect(raw).not.toContain('sid=abc');
    expect(raw).toContain('[REDACTED]');
    // 非敏感字段保留
    expect(raw).toContain('alice');
    expect(raw).toContain('"ok":true');
  });

  it('child 绑定 requestId/traceId 且可继续脱敏', async () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('test', { stream });
    const child = logger.child({ requestId: 'req-1', traceId: 'trace-1' });
    child.info('processing', { storageState: '{"cookie":"secret"}' });

    const parsed = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(parsed.requestId).toBe('req-1');
    expect(parsed.traceId).toBe('trace-1');
    expect(lines[0] ?? '').not.toContain('secret');
  });

  it('level 过滤生效', async () => {
    const { stream, lines } = captureStream();
    const logger = createLogger('test', { level: 'warn', stream });
    logger.debug('hidden');
    logger.info('hidden2');
    logger.warn('visible');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('visible');
  });
});

describe('tracing', () => {
  it('生成合法的 traceId/requestId', () => {
    const ctx = createTraceContext();
    expect(ctx.traceId).toMatch(/^[0-9a-f]{16}$/);
    expect(ctx.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(generateTraceId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('parseTraceparent 解析合法头部、拒绝非法', () => {
    expect(
      parseTraceparent('00-0123456789abcdef0123456789abcdef-0000000000000001-01')?.traceId,
    ).toBe('0123456789abcdef');
    expect(parseTraceparent('xx-invalid')).toBeNull();
    expect(parseTraceparent(undefined)).toBeNull();
    expect(parseTraceparent('01-0123456789abcdef0123456789abcdef-0000000000000001-01')).toBeNull(); // 非 00 版本
  });

  it('deriveTraceContext 沿用父 traceId、生成新 requestId', () => {
    const child = deriveTraceContext({ traceId: '0123456789abcdef', requestId: 'parent' });
    expect(child.traceId).toBe('0123456789abcdef');
    expect(child.requestId).not.toBe('parent');
    const fresh = deriveTraceContext(null);
    expect(fresh.traceId).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('health', () => {
  it('全部 ok → ok', () => {
    const report = aggregateHealth([
      dependencyCheck('postgres', true),
      dependencyCheck('redis', true),
    ]);
    expect(report.status).toBe('ok');
  });

  it('任一 down → down，任一 degraded → degraded', () => {
    const down = aggregateHealth([
      dependencyCheck('postgres', true),
      dependencyCheck('redis', false, { detail: 'connection refused' }),
    ]);
    expect(down.status).toBe('down');
    expect(down.checks.find((c) => c.name === 'redis')?.detail).toBe('connection refused');

    const degraded = aggregateHealth([
      { name: 'datasource', status: 'degraded', detail: 'high latency' },
      dependencyCheck('postgres', true),
    ]);
    expect(degraded.status).toBe('degraded');
  });
});

describe('metrics', () => {
  it('counter 累加并导出 Prometheus 文本', async () => {
    const metrics = new MetricsRegistry();
    const counter = metrics.counter(MetricNames.COLLECT_SUCCESS_TOTAL, 'collect success count');
    counter.inc();
    counter.inc();
    const snapshot = await metrics.snapshot();
    expect(snapshot).toContain('# HELP xianyu_collect_success_total collect success count');
    expect(snapshot).toContain('xianyu_collect_success_total 2');
  });

  it('同名指标复用同一实例', () => {
    const metrics = new MetricsRegistry();
    const a = metrics.counter('same', 'h');
    const b = metrics.counter('same', 'h');
    expect(a).toBe(b);
  });
});
