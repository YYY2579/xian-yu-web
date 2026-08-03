import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createPrismaClient } from '@xianyu/database';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:55432/xianyu_test';
process.env.REDIS_URL = 'redis://:xianyu_dev_redis@localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-for-api-004';

const DB_PKG = path.resolve(process.cwd(), '../../packages/database');

let app: INestApplication;
let prisma: ReturnType<typeof createPrismaClient>;
let redis: Redis;

async function registerAndLogin(email: string): Promise<string> {
  await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email, password: 'password123' })
    .expect(201);
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password: 'password123' })
    .expect(200);
  return login.body.tokens.access_token as string;
}

beforeAll(async () => {
  execFileSync(
    process.execPath,
    [path.join(DB_PKG, 'scripts/embedded-pg.mjs'), 'start', '55432', 'xianyu_test'],
    {
      stdio: 'ignore',
    },
  );
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: DB_PKG,
    env: { ...process.env },
    stdio: 'ignore',
  });
  prisma = createPrismaClient(process.env.DATABASE_URL!);
  redis = new Redis(process.env.REDIS_URL!);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

beforeEach(async () => {
  await redis.flushdb();
  await prisma.notificationRecord.deleteMany({});
  await prisma.monitorRun.deleteMany({});
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.keywordMonitor.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await redis?.quit();
});

describe('商品与价格历史查询（API-004）', () => {
  it('按关键词分页查询商品（不含 rawPayload）', async () => {
    const token = await registerAndLogin('q@example.com');
    for (let i = 0; i < 3; i++) {
      await prisma.product.create({
        data: {
          source: 'authorized-source',
          sourceProductId: `SRC-Q${i}`,
          canonicalKey: `authorized-source:SRC-Q${i}`,
          title: `iPhone 15 Pro ${i}G`,
          normalizedTitle: `iphone 15 pro ${i}g`,
          url: `https://example.com/item/${i}`,
          currentPriceCent: 5_000_00n + BigInt(i * 100),
          lastSeenAt: new Date(),
          rawPayload: { secret: 'should-not-leak' },
        },
      });
    }
    const res = await request(app.getHttpServer())
      .get('/api/products?keyword=iPhone&pageSize=2')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]?.currentPriceCent).toBeTypeOf('number');
    expect(JSON.stringify(res.body)).not.toContain('rawPayload');
  });

  it('商品详情与价格历史', async () => {
    const token = await registerAndLogin('d@example.com');
    const product = await prisma.product.create({
      data: {
        source: 'authorized-source',
        sourceProductId: 'SRC-D1',
        canonicalKey: 'authorized-source:SRC-D1',
        title: 'iPhone 15 Pro',
        normalizedTitle: 'iphone 15 pro',
        url: 'https://example.com/item/d1',
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
          priceCent: 5_500_00n,
          observedAt: new Date('2026-08-02T10:00:00+08:00'),
        },
      ],
    });

    const detail = await request(app.getHttpServer())
      .get(`/api/products/${product.id}`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.title).toBe('iPhone 15 Pro');
    expect(detail.body.currentPriceCent).toBe(5_500_00);

    const prices = await request(app.getHttpServer())
      .get(`/api/products/${product.id}/prices`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(prices.body).toHaveLength(2);
    expect(prices.body[0]?.observedAt).toContain('2026-08-02'); // 倒序
  });

  it('不存在的商品返回 404', async () => {
    const token = await registerAndLogin('nf@example.com');
    await request(app.getHttpServer())
      .get('/api/products/00000000-0000-0000-0000-000000000000')
      .set('authorization', `Bearer ${token}`)
      .expect(404);
  });
});

describe('通知记录查询（API-004）', () => {
  it('按用户隔离返回自己的通知', async () => {
    const token = await registerAndLogin('own@example.com');
    const user = await prisma.user.findUnique({ where: { email: 'own@example.com' } });
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'h' },
    });
    const monitor = await prisma.keywordMonitor.create({
      data: {
        userId: user!.id,
        keyword: 'iPhone 15 Pro',
        normalizedKeyword: 'iphone 15 pro',
        targetPriceCent: 6_000_00n,
        discountThreshold: '0.7000',
        frequencyMinutes: 30,
      },
    });
    const product = await prisma.product.create({
      data: {
        source: 'authorized-source',
        sourceProductId: 'SRC-N1',
        canonicalKey: 'authorized-source:SRC-N1',
        title: 'iPhone 15 Pro',
        normalizedTitle: 'iphone 15 pro',
        url: 'https://example.com/item/n1',
        currentPriceCent: 5_500_00n,
        lastSeenAt: new Date(),
      },
    });
    await prisma.notificationRecord.create({
      data: {
        userId: user!.id,
        monitorId: monitor.id,
        productId: product.id,
        channel: 'in-app',
        eventType: 'low_price',
        ruleVersion: 'v1',
        productPriceCent: 5_500_00n,
        idempotencyKey: 'k-own',
      },
    });
    const otherMonitor = await prisma.keywordMonitor.create({
      data: {
        userId: other.id,
        keyword: 'Sony',
        normalizedKeyword: 'sony',
        targetPriceCent: 10_000_00n,
        discountThreshold: '0.7000',
        frequencyMinutes: 30,
      },
    });
    await prisma.notificationRecord.create({
      data: {
        userId: other.id,
        monitorId: otherMonitor.id,
        productId: product.id,
        channel: 'in-app',
        eventType: 'low_price',
        ruleVersion: 'v1',
        productPriceCent: 5_000_00n,
        idempotencyKey: 'k-other',
      },
    });

    const res = await request(app.getHttpServer())
      .get('/api/notifications')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]?.eventType).toBe('low_price');
    expect(JSON.stringify(res.body)).not.toContain('k-other');
  });
});
