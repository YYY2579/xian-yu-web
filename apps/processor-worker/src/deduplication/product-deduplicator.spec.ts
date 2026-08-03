import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { NormalizedProduct } from '@xianyu/contracts';
import { createPrismaClient, ProductRepository } from '@xianyu/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProductDeduplicator } from './product-deduplicator';

// pnpm 在包目录（apps/processor-worker）运行 vitest；数据库基建在 packages/database
const DB_PKG = path.resolve(process.cwd(), '../../packages/database');
const PG_PORT = 55432;
const PG_DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PG_PORT}/${PG_DB}`;

let prisma!: PrismaClient;
let dedupe: ProductDeduplicator;

function makeProduct(overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return {
    canonical_key: 'authorized-source:SRC-001',
    source: 'authorized-source',
    source_product_id: 'SRC-001',
    title: 'iPhone 15 Pro 256G',
    normalized_title: 'iphone 15 pro 256g',
    url: 'https://example.com/item/SRC-001',
    seller_id_hash: 'hash-abc',
    price_cent: 5_999_00,
    currency: 'CNY',
    shipping_fee_cent: 0,
    condition: '95新',
    location: '杭州',
    published_at: '2026-08-01T10:00:00+08:00',
    normalized_at: '2026-08-03T00:00:00+08:00',
    original_title: 'iPhone 15 Pro 256G',
    original_price_text: '5999元',
    warnings: [],
    ...overrides,
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
  dedupe = new ProductDeduplicator(new ProductRepository(prisma));
});

beforeEach(async () => {
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('ProductDeduplicator 去重', () => {
  it('重复事件只更新一条主记录，价格变化反映到 current_price', async () => {
    const first = await dedupe.process(makeProduct({ price_cent: 6_000_00 }));
    expect(first.created).toBe(true);

    const second = await dedupe.process(makeProduct({ price_cent: 5_500_00 }));
    expect(second.created).toBe(false);
    expect(second.productId).toBe(first.productId);

    const product = await prisma.product.findUnique({ where: { id: first.productId } });
    expect(product?.currentPriceCent).toBe(5_500_00n); // 价格已更新
    expect(await prisma.product.count()).toBe(1); // 无重复主记录
  });

  it('并发 upsert 不产生重复主记录', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        dedupe.process(makeProduct({ price_cent: 5_000_00 + i })),
      ),
    );
    const ids = new Set(results.map((r) => r.productId));
    expect(ids.size).toBe(1); // 原子 ON CONFLICT 合并为一条
    expect(await prisma.product.count()).toBe(1);
  });

  it('无稳定来源 ID 时使用受控指纹合并（价格变化不拆分为新商品）', async () => {
    const base = makeProduct({ source_product_id: '' });
    const first = await dedupe.process({ ...base, price_cent: 5_000_00 });
    const second = await dedupe.process({ ...base, price_cent: 4_800_00 });

    expect(first.canonicalKey).toMatch(/^fp:[0-9a-f]{16}$/);
    expect(second.productId).toBe(first.productId); // 同指纹合并（价格变化仍同商品）
    expect(await prisma.product.count()).toBe(1);
  });

  it('指纹随标题/卖家/地区变化（不同商品不误合并）', async () => {
    const a = await dedupe.process(
      makeProduct({ source_product_id: '', title: 'iPhone 15', normalized_title: 'iphone 15' }),
    );
    const b = await dedupe.process(
      makeProduct({ source_product_id: '', title: 'Sony A7M4', normalized_title: 'sony a7m4' }),
    );
    const c = await dedupe.process(
      makeProduct({
        source_product_id: '',
        title: 'iPhone 15',
        normalized_title: 'iphone 15',
        seller_id_hash: 'hash-other',
      }),
    );
    expect(new Set([a.canonicalKey, b.canonicalKey, c.canonicalKey]).size).toBe(3); // 指纹各异
    expect(await prisma.product.count()).toBe(3);
  });

  it('来源 ID 变化视为不同主记录（各自 canonical）', async () => {
    const old = await dedupe.process(makeProduct({ source_product_id: 'SRC-001' }));
    const changed = await dedupe.process(makeProduct({ source_product_id: 'SRC-001-v2' }));
    expect(old.productId).not.toBe(changed.productId);
    expect(changed.canonicalKey).toBe('authorized-source:SRC-001-v2');
    expect(await prisma.product.count()).toBe(2);
  });
});
