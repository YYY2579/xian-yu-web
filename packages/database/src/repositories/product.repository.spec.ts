import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PriceHistoryRepository } from './price-history.repository';
import { buildCanonicalKey, ProductRepository } from './product.repository';
import { createPrismaClient } from './user.repository';

// pnpm 在包目录下运行 vitest，进程工作目录即包根
const PKG_ROOT = process.cwd();
const PORT = 55432;
const DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${DB}`;

let prisma: PrismaClient;
let products: ProductRepository;
let priceHistory: PriceHistoryRepository;

const baseInput = {
  source: 'authorized-source',
  sourceProductId: 'SRC-PROD-001',
  title: 'iPhone 15 Pro 256G',
  normalizedTitle: 'iphone 15 pro 256g',
  url: 'https://example.com/item/SRC-PROD-001',
  currentPriceCent: 5_999_00n,
  condition: '95新',
  location: '杭州',
};

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
  products = new ProductRepository(prisma);
  priceHistory = new PriceHistoryRepository(prisma);
});

beforeEach(async () => {
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('buildCanonicalKey', () => {
  it('拼接 source 与 source_product_id', () => {
    expect(buildCanonicalKey('authorized-source', 'SRC-PROD-001')).toBe(
      'authorized-source:SRC-PROD-001',
    );
  });
});

describe('ProductRepository.upsert', () => {
  it('创建商品并持久化字段与去重键', async () => {
    const p = await products.upsert({ ...baseInput, rawPayload: { rawPrice: '5999元' } });
    expect(p.canonicalKey).toBe('authorized-source:SRC-PROD-001');
    expect(p.currentPriceCent).toBe(5_999_00n);
    expect(p.currency).toBe('CNY'); // DB 默认
    // firstSeenAt（DB now）与 lastSeenAt（应用 now）应在同一采集动作内
    expect(Math.abs(p.firstSeenAt.getTime() - p.lastSeenAt.getTime())).toBeLessThan(5000);
  });

  it('重复采集只更新不新建（唯一去重生效）', async () => {
    const first = await products.upsert(baseInput);
    const updated = await products.upsert({
      ...baseInput,
      title: 'iPhone 15 Pro 256G 国行 99新',
      currentPriceCent: 5_500_00n,
    });

    expect(updated.id).toBe(first.id); // 同一条主记录
    expect(updated.currentPriceCent).toBe(5_500_00n);
    expect(updated.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first.lastSeenAt.getTime());
    expect(await prisma.product.count()).toBe(1);
  });

  it('canonical_key 唯一约束冲突（直接 create）抛 P2002', async () => {
    const key = buildCanonicalKey(baseInput.source, baseInput.sourceProductId);
    await prisma.product.create({
      data: { ...baseInput, canonicalKey: key, lastSeenAt: new Date() },
    });
    await expect(
      prisma.product.create({ data: { ...baseInput, canonicalKey: key, lastSeenAt: new Date() } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('默认查询不返回 raw_payload（访问边界），内部方法可读', async () => {
    const p = await products.upsert({ ...baseInput, rawPayload: { secret: 'raw' } });
    const viaDefault = await products.findById(p.id);
    expect(viaDefault).not.toHaveProperty('rawPayload');

    const withRaw = await products.findWithRawPayload(p.id);
    expect(withRaw?.rawPayload).toEqual({ secret: 'raw' });
  });

  it('findByCanonicalKey 命中', async () => {
    const p = await products.upsert(baseInput);
    const found = await products.findByCanonicalKey(
      buildCanonicalKey(baseInput.source, baseInput.sourceProductId),
    );
    expect(found?.id).toBe(p.id);
  });
});

describe('PriceHistoryRepository', () => {
  it('record 创建历史行', async () => {
    const p = await products.upsert(baseInput);
    const row = await priceHistory.record({
      productId: p.id,
      priceCent: 5_999_00n,
      observedAt: new Date('2026-08-01T10:00:00+08:00'),
    });
    expect(row?.priceCent).toBe(5_999_00n);
    expect(row?.sourceEventId).toBeNull();
  });

  it('相同 source_event_id 幂等：第二次跳过返回 null', async () => {
    const p = await products.upsert(baseInput);
    const eventId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const first = await priceHistory.record({
      productId: p.id,
      priceCent: 5_999_00n,
      observedAt: new Date(),
      sourceEventId: eventId,
    });
    const second = await priceHistory.record({
      productId: p.id,
      priceCent: 5_999_00n,
      observedAt: new Date(),
      sourceEventId: eventId,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await prisma.productPriceHistory.count()).toBe(1);
  });

  it('批量写入并按时间范围倒序查询', async () => {
    const p = await products.upsert(baseInput);
    const rows = [
      { priceCent: 6_000_00n, observedAt: new Date('2026-08-01T10:00:00+08:00') },
      { priceCent: 5_800_00n, observedAt: new Date('2026-08-02T10:00:00+08:00') },
      { priceCent: 5_500_00n, observedAt: new Date('2026-08-03T10:00:00+08:00') },
    ];
    for (const r of rows) {
      await priceHistory.record({ productId: p.id, ...r });
    }

    // 时间范围过滤（8-02 至 8-03），倒序
    const inRange = await priceHistory.listByProduct(p.id, {
      from: new Date('2026-08-02T00:00:00+08:00'),
      to: new Date('2026-08-03T23:59:59+08:00'),
    });
    expect(inRange.map((r) => Number(r.priceCent))).toEqual([5_500_00, 5_800_00]);

    const all = await priceHistory.listByProduct(p.id);
    expect(all).toHaveLength(3);
    expect(all[0]?.observedAt.getTime()).toBeGreaterThan(all[1]!.observedAt.getTime());
  });

  it('商品删除级联清理价格历史', async () => {
    const p = await products.upsert(baseInput);
    await priceHistory.record({ productId: p.id, priceCent: 1n, observedAt: new Date() });
    await prisma.product.delete({ where: { id: p.id } });
    expect(await prisma.productPriceHistory.count()).toBe(0);
  });
});
