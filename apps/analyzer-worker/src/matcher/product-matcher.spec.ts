import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { KeywordMonitor, PrismaClient } from '@prisma/client';
import type { ProductObservedEvent } from '@xianyu/contracts';
import {
  BaselineRepository,
  createPrismaClient,
  MonitorRepository,
  normalizeKeyword,
} from '@xianyu/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { matchProduct } from './product-matcher';

// pnpm 在包目录（apps/analyzer-worker）运行 vitest；数据库基建在 packages/database
const DB_PKG = path.resolve(process.cwd(), '../../packages/database');
const PG_PORT = 55432;
const PG_DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PG_PORT}/${PG_DB}`;

let prisma!: PrismaClient;
let monitors: MonitorRepository;

function makeObserved(overrides: Partial<ProductObservedEvent> = {}): ProductObservedEvent {
  return {
    event_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    schema_version: 1,
    observed_at: '2026-08-03T10:00:00+08:00',
    product_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    canonical_key: 'authorized-source:SRC-001',
    source: 'authorized-source',
    source_product_id: 'SRC-001',
    price_cent: 5_500_00,
    currency: 'CNY',
    monitor_id: '11111111-1111-1111-1111-111111111111',
    keyword: 'iPhone 15 Pro',
    ...overrides,
  };
}

async function createMonitor(
  userId: string,
  keyword: string,
  targetPriceCent: bigint,
): Promise<KeywordMonitor> {
  return prisma.keywordMonitor.create({
    data: {
      userId,
      keyword,
      normalizedKeyword: normalizeKeyword(keyword),
      targetPriceCent,
      discountThreshold: '0.7000',
      minSampleSize: 10,
      frequencyMinutes: 30,
      nextRunAt: new Date(),
    },
  });
}

async function seedSampleProducts(keyword: string, prices: number[]): Promise<void> {
  const now = Date.now();
  for (let i = 0; i < prices.length; i++) {
    await prisma.product.create({
      data: {
        source: 'authorized-source',
        sourceProductId: `SRC-SAMPLE-${keyword}-${i}`,
        canonicalKey: `authorized-source:SRC-SAMPLE-${keyword}-${i}`,
        title: keyword,
        normalizedTitle: normalizeKeyword(keyword),
        url: `https://example.com/item/${i}`,
        currentPriceCent: BigInt(prices[i]!),
        lastSeenAt: new Date(now - i * 3600_000),
      },
    });
  }
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
  monitors = new MonitorRepository(prisma);
});

beforeEach(async () => {
  await prisma.notificationRecord.deleteMany({});
  await prisma.monitorRun.deleteMany({});
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.keywordMonitor.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma?.$disconnect();
});

const baselineDeps = (repo: BaselineRepository) => ({
  comparablePrices: (keyword: string) => repo.findComparablePrices({ keyword }),
});

describe('matchProduct 多任务匹配', () => {
  it('同一关键词多个任务（不同阈值）全部命中并带各自决策', async () => {
    const user = await prisma.user.create({ data: { email: 'm@example.com', passwordHash: 'h' } });
    // 市场约 8450，市场限价约 5915；当前价 5500 低于双阈值
    await seedSampleProducts(
      'iphone 15 pro',
      [
        8_000_00, 8_100_00, 8_200_00, 8_300_00, 8_400_00, 8_500_00, 8_600_00, 8_700_00, 8_800_00,
        8_900_00,
      ],
    );
    const m1 = await createMonitor(user.id, 'iPhone 15 Pro', 7_000_00n);
    const m2 = await createMonitor(user.id, 'iPhone 15 Pro', 6_000_00n);

    const outcome = await matchProduct(
      makeObserved(),
      [m1, m2],
      baselineDeps(new BaselineRepository(prisma)),
    );

    expect(outcome.matches).toHaveLength(2);
    const byMonitor = new Map(outcome.matches.map((m) => [m.monitor_id, m]));
    expect(byMonitor.get(m1.id)?.target_price_cent).toBe(7_000_00);
    expect(byMonitor.get(m2.id)?.target_price_cent).toBe(6_000_00);
    expect(byMonitor.get(m1.id)?.reason).toBe('below_both_targets');
    expect(outcome.skipped).toHaveLength(0);
  });

  it('关键词不匹配的任务被跳过（keyword_mismatch）', async () => {
    const user = await prisma.user.create({ data: { email: 'm2@example.com', passwordHash: 'h' } });
    const unrelated = await createMonitor(user.id, 'Sony A7M4', 10_000_00n);

    const outcome = await matchProduct(
      makeObserved(),
      [unrelated],
      baselineDeps(new BaselineRepository(prisma)),
    );
    expect(outcome.matches).toHaveLength(0);
    expect(outcome.skipped).toContainEqual({ monitorId: unrelated.id, reason: 'keyword_mismatch' });
  });

  it('价格高于阈值不命中（not_low_price）', async () => {
    const user = await prisma.user.create({ data: { email: 'm3@example.com', passwordHash: 'h' } });
    const strict = await createMonitor(user.id, 'iPhone 15 Pro', 5_000_00n); // 5000 < 5500

    const outcome = await matchProduct(
      makeObserved(),
      [strict],
      baselineDeps(new BaselineRepository(prisma)),
    );
    expect(outcome.matches).toHaveLength(0);
    expect(outcome.skipped).toContainEqual({ monitorId: strict.id, reason: 'not_low_price' });
  });
});

describe('matchProduct 条件组合与样本不足', () => {
  it('样本不足时仅用户阈值命中（below_user_target，不引用市场结论）', async () => {
    const user = await prisma.user.create({ data: { email: 'm4@example.com', passwordHash: 'h' } });
    // 无样本（sony a7m4 无可比商品）
    const monitor = await createMonitor(user.id, 'Sony A7M4', 6_000_00n);

    const outcome = await matchProduct(
      makeObserved({
        keyword: 'Sony A7M4',
        price_cent: 5_500_00,
        monitor_id: '22222222-2222-2222-2222-222222222222',
      }),
      [monitor],
      baselineDeps(new BaselineRepository(prisma)),
    );

    expect(outcome.matches).toHaveLength(1);
    expect(outcome.matches[0]?.reason).toBe('below_user_target');
    expect(outcome.matches[0]?.market_price_cent).toBeNull(); // 样本不足无市场价
  });

  it('样本充足时市场基线参与判定（低于市场限价才命中）', async () => {
    const user = await prisma.user.create({ data: { email: 'm5@example.com', passwordHash: 'h' } });
    await seedSampleProducts(
      'iphone 15 pro',
      [
        8_000_00, 8_100_00, 8_200_00, 8_300_00, 8_400_00, 8_500_00, 8_600_00, 8_700_00, 8_800_00,
        8_900_00,
      ],
    );
    // 市场约 8500 * 0.7 = 5950；当前价 5500 低于市场限价，命中
    const monitor = await createMonitor(user.id, 'iPhone 15 Pro', 9_000_00n);

    const outcome = await matchProduct(
      makeObserved({ price_cent: 3_000_00 }),
      [monitor],
      baselineDeps(new BaselineRepository(prisma)),
    );
    expect(outcome.matches).toHaveLength(1);
    expect(outcome.matches[0]?.reason).toBe('below_both_targets');
    expect(outcome.matches[0]?.market_price_cent).not.toBeNull();
    expect(outcome.matches[0]?.risk_score).toBeGreaterThan(0); // 远低于市场（<0.4 倍）→ 风险标记
  });
});
