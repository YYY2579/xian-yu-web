import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { NormalizedProduct, RawProductEvent } from '@xianyu/contracts';
import {
  createRawProductEvent,
  iphoneFixtureInput,
  type RawProductEventInput,
} from '@xianyu/contracts';
import { createPrismaClient, PriceHistoryRepository, ProductRepository } from '@xianyu/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProductDeduplicator } from '../deduplication/product-deduplicator';
import { PriceHistoryHandler } from './price-history.handler';

// pnpm 在包目录（apps/processor-worker）运行 vitest；数据库基建在 packages/database
const DB_PKG = path.resolve(process.cwd(), '../../packages/database');
const PG_PORT = 55432;
const PG_DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PG_PORT}/${PG_DB}`;

let prisma!: PrismaClient;
let handler: PriceHistoryHandler;
let dedupe: ProductDeduplicator;
let productId: string;

function makeEvent(overrides: Partial<RawProductEventInput> = {}): RawProductEvent {
  return createRawProductEvent({
    ...iphoneFixtureInput,
    monitor_id: '11111111-1111-1111-1111-111111111111',
    keyword: 'iPhone 15 Pro',
    ...overrides,
  });
}

function makeNormalized(event: RawProductEvent): NormalizedProduct {
  return {
    canonical_key: `${event.source}:${event.product.source_product_id}`,
    source: event.source,
    source_product_id: event.product.source_product_id,
    title: event.product.title,
    normalized_title: event.product.title.toLowerCase(),
    url: event.product.url,
    seller_id_hash: event.product.seller_id_hash,
    price_cent: event.product.price_cent,
    currency: event.product.currency,
    shipping_fee_cent: event.product.shipping_fee_cent,
    condition: event.product.condition,
    location: event.product.location,
    published_at: event.product.published_at,
    normalized_at: new Date().toISOString(),
    original_title: event.product.title,
    original_price_text: null,
    warnings: [],
  };
}

beforeAll(() => {
  execFileSync(
    process.execPath,
    [path.join(DB_PKG, 'scripts/embedded-pg.mjs'), 'start', String(PG_PORT), PG_DB],
    { stdio: 'ignore' },
  );
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: DB_PKG,
    env: { ...process.env, DATABASE_URL },
    stdio: 'ignore',
  });
  prisma = createPrismaClient(DATABASE_URL);
  const products = new ProductRepository(prisma);
  handler = new PriceHistoryHandler({
    products,
    priceHistory: new PriceHistoryRepository(prisma),
  });
  dedupe = new ProductDeduplicator(products);
});

beforeEach(async () => {
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
  const event = makeEvent();
  const dedup = await dedupe.process(makeNormalized(event));
  productId = dedup.productId;
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('PriceHistoryHandler', () => {
  it('写入价格历史并产出 ProductObservedEvent', async () => {
    const event = makeEvent();
    const result = await handler.handle(event, productId, makeNormalized(event));

    expect(result.recorded).toBe(true);
    expect(result.observed.product_id).toBe(productId);
    expect(result.observed.price_cent).toBe(5_999_00);
    expect(result.observed.monitor_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(result.observed.schema_version).toBe(1);
    expect(await prisma.productPriceHistory.count()).toBe(1);
  });

  it('相同事件重复消费不增加历史行（source_event_id 幂等）', async () => {
    const event = makeEvent();
    await handler.handle(event, productId, makeNormalized(event));
    const second = await handler.handle(event, productId, makeNormalized(event));

    expect(second.recorded).toBe(false); // 幂等跳过
    expect(await prisma.productPriceHistory.count()).toBe(1);
  });

  it('不同价格/观察时间按策略各记一条', async () => {
    const base1 = makeEvent();
    const event1: RawProductEvent = { ...base1, occurred_at: '2026-08-01T10:00:00+08:00' };
    await handler.handle(event1, productId, makeNormalized(event1));

    const base2 = makeEvent();
    const event2: RawProductEvent = { ...base2, occurred_at: '2026-08-02T10:00:00+08:00' };
    await handler.handle(event2, productId, makeNormalized(event2));

    const rows = await prisma.productPriceHistory.findMany({ orderBy: { observedAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.observedAt.toISOString()).toContain('2026-08-01');
  });

  it('批量事件全部写入', async () => {
    for (let i = 0; i < 5; i++) {
      const base = makeEvent();
      const event: RawProductEvent = { ...base, occurred_at: `2026-08-0${i + 1}T10:00:00+08:00` };
      await handler.handle(event, productId, makeNormalized(event));
    }
    expect(await prisma.productPriceHistory.count()).toBe(5);
  });

  it('无效 productId（外键失败）抛错且不产生历史行', async () => {
    const event = makeEvent();
    const invalidId = '00000000-0000-0000-0000-000000000000';
    await expect(handler.handle(event, invalidId, makeNormalized(event))).rejects.toThrow();
    expect(await prisma.productPriceHistory.count()).toBe(0); // 回滚：无部分写入
  });
});
