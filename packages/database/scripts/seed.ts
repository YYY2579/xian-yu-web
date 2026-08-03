/**
 * 测试种子数据（DB-005）
 * 用法：NODE_ENV=test node src/seed.ts（Node 24 直跑 TS）
 * - 仅允许 NODE_ENV=test / development 执行（生产环境拒绝）。
 * - 覆盖：用户、监控任务、商品、价格历史、通知记录，供本地联调与集成测试。
 * 幂等：清空已有业务数据后重新写入。
 */

const ALLOWED_SEED_ENVS = new Set(['test', 'development']);
const nodeEnv = process.env.NODE_ENV ?? 'development';

if (!ALLOWED_SEED_ENVS.has(nodeEnv)) {
  console.error(`[seed] 拒绝在 NODE_ENV=${nodeEnv} 环境执行种子（仅允许 test/development）`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('[seed] 缺少 DATABASE_URL 环境变量');
  process.exit(1);
}

import { createPrismaClient } from '../dist/index.js';

const prisma = createPrismaClient(process.env.DATABASE_URL);

try {
  // 幂等：清空业务表（顺序满足外键）
  await prisma.notificationRecord.deleteMany({});
  await prisma.monitorRun.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.keywordMonitor.deleteMany({});
  await prisma.user.deleteMany({});

  // 用户
  const alice = await prisma.user.create({
    data: { email: 'alice@example.com', passwordHash: 'hashed-placeholder', displayName: 'Alice' },
  });

  // 监控任务
  const monitor = await prisma.keywordMonitor.create({
    data: {
      userId: alice.id,
      keyword: 'iPhone 15 Pro',
      normalizedKeyword: 'iphone 15 pro',
      targetPriceCent: 6_000_00n,
      discountThreshold: '0.7000',
      frequencyMinutes: 30,
      nextRunAt: new Date(Date.now() - 60_000),
    },
  });

  // 商品 + 价格历史
  const product = await prisma.product.create({
    data: {
      source: 'authorized-source',
      sourceProductId: 'SEED-PROD-001',
      canonicalKey: 'authorized-source:SEED-PROD-001',
      title: 'iPhone 15 Pro 256G 95新',
      normalizedTitle: 'iphone 15 pro 256g 95新',
      url: 'https://example.com/item/SEED-PROD-001',
      currentPriceCent: 5_500_00n,
      lastSeenAt: new Date(),
    },
  });
  await prisma.productPriceHistory.createMany({
    data: [
      {
        productId: product.id,
        priceCent: 6_000_00n,
        observedAt: new Date('2026-08-01T10:00:00+08:00'),
      },
      {
        productId: product.id,
        priceCent: 5_800_00n,
        observedAt: new Date('2026-08-02T10:00:00+08:00'),
      },
      {
        productId: product.id,
        priceCent: 5_500_00n,
        observedAt: new Date('2026-08-03T10:00:00+08:00'),
      },
    ],
  });

  // 通知记录
  await prisma.notificationRecord.create({
    data: {
      userId: alice.id,
      monitorId: monitor.id,
      productId: product.id,
      channel: 'in-app',
      eventType: 'low_price',
      ruleVersion: 'rule-v1',
      productPriceCent: 5_500_00n,
      marketPriceCent: 6_200_00n,
      discountRate: '0.8871',
      idempotencyKey: 'seed:alice:iphone15pro:rule-v1',
    },
  });

  console.log('[seed] 种子数据写入完成（test/development 环境）');
} finally {
  await prisma.$disconnect();
}
