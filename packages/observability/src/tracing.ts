import { randomBytes, randomUUID } from 'crypto';

/**
 * 链路追踪上下文（FND-006）
 * - requestId：请求/任务唯一标识（UUID v4）。
 * - traceId：跨服务关联的追踪 ID（16 位十六进制，兼容 W3C traceparent 格式）。
 * MVP 采用轻量实现（不引入 OpenTelemetry SDK）；后续可替换为 OTel 而保持接口。
 */

export type TraceContext = {
  requestId: string;
  traceId: string;
};

export function generateTraceId(): string {
  // W3C trace-id 为 32 位十六进制；MVP 用 16 位（64bit）足够，格式兼容可演进
  return randomBytes(8).toString('hex').padStart(16, '0');
}

/** 创建新的追踪上下文 */
export function createTraceContext(): TraceContext {
  return { requestId: randomUUID(), traceId: generateTraceId() };
}

/** 解析 W3C traceparent 头（version-traceid-parentid-flags）；无效返回 null */
export function parseTraceparent(header: string | undefined | null): { traceId: string } | null {
  if (!header) return null;
  const parts = header.trim().split('-');
  if (parts.length >= 2 && parts[0] === '00' && /^[0-9a-f]{16,32}$/.test(parts[1] ?? '')) {
    return { traceId: (parts[1] as string).slice(0, 16) };
  }
  return null;
}

/**
 * 基于父上下文创建子上下文：
 * - 有合法父 traceId 则沿用（跨服务链路），否则生成新的；
 * - requestId 始终新生成（每个请求/任务独立）。
 */
export function deriveTraceContext(parent?: TraceContext | { traceId?: string } | null): TraceContext {
  const traceId =
    parent && parent.traceId && /^[0-9a-f]{16}$/.test(parent.traceId) ? parent.traceId : generateTraceId();
  return { requestId: randomUUID(), traceId };
}
