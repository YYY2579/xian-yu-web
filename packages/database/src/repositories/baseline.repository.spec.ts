import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { calculateBaseline } from '@xianyu/pricing-engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BaselineRepository } from './baseline.repository';
import { createPrismaClient } from './user.repository';

// pnpm 在包目录（packages/database）运行 vitest
const PKG_ROOT = process.cwd();
const PORT = 55432;
const DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${DB}`;

let prisma!: PrismaClient;
let repo: BaselineRepository;

async function seedProduct(
  normalizedTitle: string,
  priceCent: bigint,
  lastSeenAt: Date,
  idSuffix: string,
): Promise<void> {
  await prisma.product.create({
    data: {
      source: 'authorized-source',
      sourceProductId: `SRC-${idSuffix}`,
      canonicalKey: `authorized-source:SRC-${idSuffix}`,
      title: normalizedTitle,
      normalizedTitle,
      url: `https://example.com/item/${idSuffix}`,
      currentPriceCent: priceCent,
      lastSeenAt,
    },
  });
}

beforeAll(() => {
  execFileSync(
    process.execPath,
    [path.join(PKG_ROOT, 'scripts/embedded-pg.mjs'), 'start', String(PORT), DB],
    {
      stdio: 'ignore',
    },
  );
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: PKG_ROOT,
    env: { ...process.env, DATABASE_URL },
    stdio: 'ignore',
  });
  prisma = createPrismaClient(DATABASE_URL);
  repo = new BaselineRepository(prisma);
});

beforeEach(async () => {
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('BaselineRepository.findComparablePrices', () => {
  it('只返回近 7 天活跃且标题匹配的商品', async () => {
    const now = Date.now();
    await seedProduct('iphone 15 pro 256g', 5_800_00n, new Date(now - 1 * 24 * 3600_000), 'a');
    await seedProduct('iphone 15 pro 128g', 5_200_00n, new Date(now - 2 * 24 * 3600_000), 'b');
    await seedProduct('iphone 15 pro 512g', 6_500_00n, new Date(now - 10 * 24 * 3600_000), 'c'); // 超 7 天
    await seedProduct('sony a7m4 全新', 15_000_00n, new Date(now - 1 * 24 * 3600_000), 'd'); // 不匹配

    const prices = await repo.findComparablePrices({ keyword: 'iPhone 15 Pro' });
    expect(prices.sort((a, b) => Number(a) - Number(b))).toEqual([5_200_00n, 5_800_00n]);
  });

  it('可排除指定商品（自身）', async () => {
    const now = Date.now();
    await seedProduct('iphone 15 pro 256g', 5_800_00n, new Date(now - 1 * 24 * 3600_000), 'a');
    await seedProduct('iphone 15 pro 256g', 5_200_00n, new Date(now - 2 * 24 * 3600_000), 'b');

    const exclude = await prisma.product.findFirst({ where: { sourceProductId: 'SRC-a' } });
    const prices = await repo.findComparablePrices({
      keyword: 'iphone 15 pro',
      excludeProductId: exclude?.id,
    });
    expect(prices).toEqual([5_200_00n]);
  });

  it('自定义窗口天数生效', async () => {
    const now = Date.now();
    await seedProduct('iphone 15 pro', 5_800_00n, new Date(now - 2 * 24 * 3600_000), 'a');
    await seedProduct('iphone 15 pro', 5_200_00n, new Date(now - 6 * 24 * 3600_000), 'b');

    const strict = await repo.findComparablePrices({ keyword: 'iphone 15 pro', days: 3 });
    expect(strict).toEqual([5_800_00n]); // 6 天前的被窗口排除
  });
});

describe('端到端：样本 -> 市场价基线', () => {
  it('样本足够时生成中位价，样本不足时 insufficient', async () => {
    const now = Date.now();
    const prices = [
      5_000_00, 5_200_00, 5_400_00, 5_600_00, 5_800_00, 6_000_00, 6_200_00, 6_400_00, 6_600_00,
      6_800_00, 9_999_00,
    ];
    for (let i = 0; i < prices.length; i++) {
      await seedProduct(
        'iphone 15 pro',
        BigInt(prices[i]!),
        new Date(now - (i + 1) * 3600_000),
        `e${i}`,
      );
    }

    const samples = await repo.findComparablePrices({ keyword: 'iphone 15 pro' });
    const baseline = calculateBaseline(samples.map((v) => Number(v)));

    expect(baseline.baseline_status).toBe('ok');
    expect(baseline.sample_size).toBeGreaterThanOrEqual(10);
    expect(baseline.market_price_cent).not.toBeNull();
    expect(baseline.market_price_cent).toBeGreaterThan(5_000_00);
    expect(baseline.market_price_cent).toBeLessThan(9_000_00); // 极端高价未污染

    // 样本不足场景
    const fewSamples = await repo.findComparablePrices({ keyword: 'sony a7m4' });
    const insufficient = calculateBaseline(fewSamples.map((v) => Number(v)));
    expect(insufficient.baseline_status).toBe('insufficient');
    expect(insufficient.market_price_cent).toBeNull();
  });
});
