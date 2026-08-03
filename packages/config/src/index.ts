import { z } from 'zod';
import { applyDotenvFiles } from './env';

/**
 * 共享配置契约（FND-003）
 *
 * 所有服务（API、scheduler、worker）统一使用 loadConfig() 读取并校验环境变量：
 * - 必填项缺失或类型非法时抛 ConfigError，错误信息明确列出问题字段。
 * - 金额一律使用整数分、时间一律带时区（由上层业务保证）；本包只负责配置契约。
 * - 密钥/URL 等敏感字段通过 toSanitized() 脱敏后再进入日志，禁止直接打印。
 */

/** 空字符串视为未设置，避免 .env 中残留的占位空值触发校验错误。 */
const emptyToUndefined = (v: unknown): unknown => (v === '' ? undefined : v);

const reqStr = (message: string) =>
  z.preprocess(emptyToUndefined, z.string().min(1, { message }));
const optStr = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optNum = z
  .preprocess(emptyToUndefined, z.coerce.number().int('must be an integer').positive('must be a positive integer').optional());

export const NODE_ENVS = ['development', 'test', 'staging', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const envSchema = z.object({
  /** 运行环境，决定 .env.<env> 覆盖与默认值行为 */
  NODE_ENV: z.preprocess(emptyToUndefined, z.enum(NODE_ENVS)).default('development'),

  /** PostgreSQL 连接串（必填） */
  DATABASE_URL: reqStr('is required'),
  /** Redis 连接串（必填） */
  REDIS_URL: reqStr('is required'),

  /** API 监听端口（可选，默认 3000） */
  PORT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int('must be an integer').positive('must be a positive integer').default(3000),
  ),
  /** 日志级别（可选，默认 info） */
  LOG_LEVEL: z.preprocess(emptyToUndefined, z.enum(LOG_LEVELS)).default('info'),

  /** RabbitMQ 连接串（可选；MVP 可先用 Redis/BullMQ） */
  RABBITMQ_URL: optStr,

  /** 邮件通知（可选，EXT-002 凭据到位后启用） */
  EMAIL_SMTP_HOST: optStr,
  EMAIL_SMTP_PORT: optNum,
  EMAIL_SMTP_USER: optStr,
  EMAIL_SMTP_PASSWORD: optStr,
  EMAIL_FROM: optStr,

  /** 企业微信机器人（可选） */
  WECHAT_WEBHOOK_URL: z.preprocess(emptyToUndefined, z.string().url('must be a valid URL').optional()),

  /** 数据源授权（可选，EXT-001 授权到位后启用） */
  DATASOURCE_AUTH_TOKEN: optStr,
  /** 授权会话 storageState 受控目录（必须位于 .gitignore 覆盖范围） */
  DATASOURCE_STORAGE_STATE_DIR: optStr,
});

export type Config = z.infer<typeof envSchema>;

/** 配置校验失败错误：携带可读的字段问题列表。 */
export class ConfigError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment configuration: ${issues.join('; ')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/** 命中敏感模式（密码/token/密钥/连接串）的字段一律脱敏。 */
const SENSITIVE_PATTERN = /password|token|secret|url/i;

/** 生成可安全进入日志/异常消息的配置视图，绝不包含明文密钥。 */
export function toSanitized(config: Config): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue;
    out[key] = SENSITIVE_PATTERN.test(key) ? '***' : String(value);
  }
  return out;
}

export interface LoadConfigOptions {
  /** 是否先加载 .env 文件（默认 true；测试中传 false 以隔离环境变量） */
  loadDotEnv?: boolean;
}

/**
 * 读取并校验配置。
 * @param env   环境变量来源（默认 process.env）
 * @param options 加载选项
 * @throws ConfigError 必填缺失或类型非法时
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, options: LoadConfigOptions = {}): Config {
  if (options.loadDotEnv !== false) {
    applyDotenvFiles(env.NODE_ENV);
  }
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path} ${issue.message}`;
    });
    throw new ConfigError(issues);
  }
  return parsed.data;
}
