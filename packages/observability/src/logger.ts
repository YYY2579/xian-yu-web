import { pino, type Logger as PinoLogger, type LoggerOptions } from 'pino';

/**
 * JSON 结构化日志（FND-006）
 * - 所有输出为 JSON 行，包含 name/level/time/msg/上下文。
 * - 敏感字段（password/token/secret/authorization/cookie/storageState 等）自动脱敏，
 *   任何层级（含嵌套对象）命中路径即替换为 [REDACTED]。
 * - child() 绑定 requestId/traceId 等上下文，实现请求/任务级关联。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;

export interface AppLogger {
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  error(msg: string, context?: LogContext): void;
  /** 派生带绑定上下文的子日志器（如 requestId/traceId） */
  child(bindings: LogContext): AppLogger;
}

/** 敏感字段路径清单：命中即脱敏（支持 pino 通配路径，匹配任意层级） */
export const SENSITIVE_PATHS = [
  'password',
  '*.password',
  '**password**',
  'token',
  '*.token',
  '**token**',
  'secret',
  '*.secret',
  '**secret**',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  '**cookie**',
  'storageState',
  '*.storageState',
  'credential',
  '*.credential',
  'idempotencyKey',
  '*.idempotencyKey',
];

export const REDACT_PLACEHOLDER = '[REDACTED]';

function createPino(options: { name: string; level?: LogLevel; stream?: NodeJS.WritableStream }): PinoLogger {
  const loggerOptions: LoggerOptions = {
    name: options.name,
    level: options.level ?? 'info',
    redact: { paths: SENSITIVE_PATHS, censor: REDACT_PLACEHOLDER },
    base: undefined, // 不输出默认 pid/hostname，保持精简
  };
  return options.stream
    ? pino(loggerOptions, options.stream)
    : pino(loggerOptions);
}

function wrap(logger: PinoLogger): AppLogger {
  return {
    debug: (msg, ctx) => logger.debug(ctx ?? {}, msg),
    info: (msg, ctx) => logger.info(ctx ?? {}, msg),
    warn: (msg, ctx) => logger.warn(ctx ?? {}, msg),
    error: (msg, ctx) => logger.error(ctx ?? {}, msg),
    child: (bindings) => wrap(logger.child(bindings)),
  };
}

/** 创建应用日志器；stream 用于测试捕获（默认 stdout） */
export function createLogger(name: string, options?: { level?: LogLevel; stream?: NodeJS.WritableStream }): AppLogger {
  return wrap(createPino({ name, level: options?.level, stream: options?.stream }));
}
