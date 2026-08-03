import { randomUUID } from 'crypto';
import { z } from 'zod';

/**
 * RawProductEvent 契约（COL-001）
 *
 * 采集适配器 -> 清洗/处理服务的唯一事件格式：
 * - 所有事件必须携带 event_id、occurred_at、schema_version。
 * - 金额一律整数分（priceCent / shippingFeeCent）。
 * - 时间为 ISO 8601 带时区（occurredAt / publishedAt）。
 * - 适配器只输出本事件，禁止直接写数据库、做价格判断或发送通知。
 */

export const RAW_PRODUCT_EVENT_SCHEMA_VERSION = 1;

const isoDateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: 'must be a valid ISO 8601 datetime',
});

export const rawProductEventSchema = z.object({
  /** 事件唯一 ID（UUID v4），用于幂等消费 */
  event_id: z.string().uuid('must be a valid UUID'),
  /** 数据源标识，如 'authorized-source' */
  source: z.string().min(1),
  /** 事件契约版本；消费者仅接受与当前版本匹配的事件 */
  schema_version: z.literal(RAW_PRODUCT_EVENT_SCHEMA_VERSION),
  /** 采集发生时间（ISO 8601 带时区） */
  occurred_at: isoDateTime,
  /** 触发本次采集的监控任务 ID */
  monitor_id: z.string().min(1),
  /** 触发采集的原始关键词 */
  keyword: z.string().min(1),

  product: z.object({
    /** 数据源商品 ID（去重主键 source + source_product_id） */
    source_product_id: z.string().min(1),
    title: z.string().min(1),
    /** 原始商品链接（合法获取） */
    url: z.string().url('must be a valid URL'),
    /** 当前价格，整数分 */
    price_cent: z.number().int().nonnegative(),
    /** 运费，整数分；未知为 null */
    shipping_fee_cent: z.number().int().nonnegative().nullable(),
    /** 货币，默认 CNY */
    currency: z.string().min(1).default('CNY'),
    /** 成色（数据源原始值），未知为 null */
    condition: z.string().nullable(),
    /** 地区文本 */
    location: z.string().nullable(),
    /** 上架时间（ISO 8601 带时区） */
    published_at: isoDateTime.nullable(),
    /** 脱敏后的卖家标识（禁止原始账号信息） */
    seller_id_hash: z.string().nullable(),
    /** 数据源原始载荷（仅内部审计使用，访问受限） */
    raw_payload: z.unknown(),
  }),
});

export type RawProductEvent = z.infer<typeof rawProductEventSchema>;

export type RawProductEventInput = Omit<
  z.input<typeof rawProductEventSchema>,
  'schema_version' | 'event_id' | 'occurred_at'
>;

export type ParseResult =
  { success: true; data: RawProductEvent } | { success: false; errors: string[] };

/**
 * 构造事件：自动生成 event_id（UUID v4）与 occurred_at（当前时间），
 * 固定写入当前 schema_version。这是采集适配器生成事件的唯一入口。
 */
export function createRawProductEvent(input: RawProductEventInput): RawProductEvent {
  const event: RawProductEvent = {
    event_id: randomUUID(),
    source: input.source,
    schema_version: RAW_PRODUCT_EVENT_SCHEMA_VERSION,
    occurred_at: new Date().toISOString(),
    monitor_id: input.monitor_id,
    keyword: input.keyword,
    product: {
      currency: 'CNY',
      ...input.product,
    },
  };
  return rawProductEventSchema.parse(event);
}

/** 校验任意值是否为当前版本的合法事件 */
export function parseRawProductEvent(value: unknown): ParseResult {
  const result = rawProductEventSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

/** 检查事件是否匹配当前契约版本（版本不兼容的旧/新事件拒绝消费） */
export function isSchemaVersionCompatible(schemaVersion: number): boolean {
  return schemaVersion === RAW_PRODUCT_EVENT_SCHEMA_VERSION;
}
