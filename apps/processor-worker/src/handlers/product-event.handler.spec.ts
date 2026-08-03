import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { RawProductEvent } from '@xianyu/contracts';
import { createRawProductEvent, iphoneFixtureInput } from '@xianyu/contracts';
import { createPrismaClient, PriceHistoryRepository, ProductRepository } from '@xianyu/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizeProduct, ProductDeduplicator } from '../index';
import { PriceHistoryHandler } from './price-history.handler';
import { ProductEventHandler } from './product-event.handler';

// pnpm 在包目录（apps/processor-worker）运行 vitest；数据库基建在 packages/database
const DB_PKG = path.resolve(process.cwd(), '../../packages/database');
const PG_PORT = 55432;
const PG_DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PG_PORT}/${PG_DB}`;

let prisma!: PrismaClient;
let handler: ProductEventHandler;

function makeEvent(overrides: Partial<typeof iphoneFixtureInput> = {}): RawProductEvent {
  return createRawProductEvent({
    ...iphoneFixtureInput,
    monitor_id: '11111111-1111-1111-1111-111111111111',
    keyword: 'iPhone 15 Pro',
    ...overrides,
  });
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
  const priceHistory = new PriceHistoryHandler({
    products,
    priceHistory: new PriceHistoryRepository(prisma),
  });
  handler = new ProductEventHandler({
    dedupe: new ProductDeduplicator(products),
    priceHistory,
  });
});

beforeEach(async () => {
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('ProductEventHandler 全链路', () => {
  it('合法事件：标准化 -> 去重 -> 价格历史 -> 观察事件', async () => {
    const event = makeEvent();
    const outcome = await handler.process(event);

    expect(outcome.status).toBe('processed');
    if (outcome.status !== 'processed') return;
    expect(outcome.observed.price_cent).toBe(5_999_00);
    expect(outcome.observed.monitor_id).toBe('11111111-1111-1111-1111-111111111111');
    expect(await prisma.product.count()).toBe(1);
    expect(await prisma.productPriceHistory.count()).toBe(1);
  });

  it('清洗失败事件被拒绝（不产生数据）', async () => {
    // 绕过契约校验构造非法价格事件（防御层兜底）
    const event = makeEvent();
    const invalid = { ...event, product: { ...event.product, price_cent: -1 } } as RawProductEvent;
    const outcome = await handler.process(invalid);

    expect(outcome.status).toBe('rejected');
    if (outcome.status === 'rejected') expect(outcome.reason).toBe('INVALID_PRICE');
    expect(await prisma.product.count()).toBe(0);
  });

  it('非交易商品（求购）被过滤并给出原因', async () => {
    const event = makeEvent({
      product: { ...iphoneFixtureInput.product, title: '求购 iPhone 15 Pro' },
    });
    const outcome = await handler.process(event);

    expect(outcome.status).toBe('filtered');
    if (outcome.status === 'filtered') {
      expect(outcome.reason.category).toBe('buy_request');
      expect(outcome.reason.matchedTerm).toBe('求购');
    }
    expect(await prisma.product.count()).toBe(0);
  });

  it('重复事件只产生一条价格历史（幂等）', async () => {
    const event = makeEvent();
    await handler.process(event);
    const second = await handler.process(event);

    expect(second.status).toBe('processed');
    expect(await prisma.product.count()).toBe(1);
    expect(await prisma.productPriceHistory.count()).toBe(1); // 幂等不重复
  });

  it('脏数据不阻塞后续消息', async () => {
    const bad = makeEvent();
    const invalid = { ...bad, product: { ...bad.product, price_cent: -5 } } as RawProductEvent;
    await handler.process(invalid); // rejected

    const good = makeEvent({
      product: {
        ...iphoneFixtureInput.product,
        title: 'Sony A7M4 全新',
        source_product_id: 'SRC-002',
      },
    });
    const outcome = await handler.process(good); // processed

    expect(outcome.status).toBe('processed');
    expect(await prisma.product.count()).toBe(1); // 只有合法商品
  });

  it('normalizeProduct 与编排 handler 结果一致（字段透传）', () => {
    const event = makeEvent();
    const normalized = normalizeProduct(event);
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.product.canonical_key).toBe('authorized-source:SRC-PROD-001');
    }
  });
});
