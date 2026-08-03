import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createPrismaClient } from '@xianyu/database';
import Redis from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

// 测试依赖：嵌入式 PostgreSQL（55432）+ docker Redis（6379）
process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:55432/xianyu_test';
process.env.REDIS_URL = 'redis://:xianyu_dev_redis@localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-for-api-003';

// pnpm 在包目录（apps/api）运行 vitest；数据库基建在 packages/database
const DB_PKG = path.resolve(process.cwd(), '../../packages/database');

let app: INestApplication;
let prisma: ReturnType<typeof createPrismaClient>;
let redis: Redis;

const monitorBody = {
  keyword: 'iPhone 15 Pro',
  targetPriceCent: 6_000_00,
  discountThreshold: 0.7,
  minSampleSize: 10,
  frequencyMinutes: 30,
};

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
  prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
  redis = new Redis(process.env.REDIS_URL ?? '');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

beforeEach(async () => {
  await redis.flushdb();
  await prisma.notificationRecord.deleteMany({});
  await prisma.monitorRun.deleteMany({});
  await prisma.keywordMonitor.deleteMany({});
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await redis?.quit();
});

describe('监控任务 CRUD（API-003）', () => {
  it('创建任务并返回视图（金额为 number）', async () => {
    const token = await registerAndLogin('owner@example.com');
    const res = await request(app.getHttpServer())
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send(monitorBody)
      .expect(201);
    expect(res.body).toMatchObject({
      keyword: 'iPhone 15 Pro',
      targetPriceCent: 6_000_00,
      status: 'ACTIVE',
    });
    expect(typeof res.body.targetPriceCent).toBe('number');
  });

  it('列表分页返回自己的任务', async () => {
    const token = await registerAndLogin('list@example.com');
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/monitors')
        .set('authorization', `Bearer ${token}`)
        .send({ ...monitorBody, keyword: `Item ${i}` })
        .expect(201);
    }
    const page1 = await request(app.getHttpServer())
      .get('/api/monitors?page=1&pageSize=2')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(page1.body.total).toBe(3);
    expect(page1.body.items).toHaveLength(2);
  });

  it('更新任务（关键词变化重算归一化）', async () => {
    const token = await registerAndLogin('update@example.com');
    const created = await request(app.getHttpServer())
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send(monitorBody)
      .expect(201);
    const updated = await request(app.getHttpServer())
      .patch(`/api/monitors/${created.body.id}`)
      .set('authorization', `Bearer ${token}`)
      .send({ keyword: 'Sony A7M4', targetPriceCent: 15_000_00 })
      .expect(200);
    expect(updated.body.keyword).toBe('Sony A7M4');
    expect(updated.body.targetPriceCent).toBe(15_000_00);

    const stored = await prisma.keywordMonitor.findUnique({ where: { id: created.body.id } });
    expect(stored?.normalizedKeyword).toBe('sony a7m4');
  });

  it('暂停/恢复状态流转', async () => {
    const token = await registerAndLogin('state@example.com');
    const created = await request(app.getHttpServer())
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send(monitorBody)
      .expect(201);
    const paused = await request(app.getHttpServer())
      .post(`/api/monitors/${created.body.id}/pause`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(paused.body.status).toBe('PAUSED');
    const resumed = await request(app.getHttpServer())
      .post(`/api/monitors/${created.body.id}/resume`)
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(resumed.body.status).toBe('ACTIVE');
  });

  it('删除任务（级联清理通知）', async () => {
    const token = await registerAndLogin('delete@example.com');
    const created = await request(app.getHttpServer())
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send(monitorBody)
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/monitors/${created.body.id}`)
      .set('authorization', `Bearer ${token}`)
      .expect(204);
    expect(await prisma.keywordMonitor.count({ where: { id: created.body.id } })).toBe(0);
  });
});

describe('所有权隔离与校验（API-003）', () => {
  it('其他用户的任务不可见不可改（404）', async () => {
    const ownerToken = await registerAndLogin('owner2@example.com');
    const created = await request(app.getHttpServer())
      .post('/api/monitors')
      .set('authorization', `Bearer ${ownerToken}`)
      .send(monitorBody)
      .expect(201);

    const intruderToken = await registerAndLogin('intruder@example.com');
    await request(app.getHttpServer())
      .get(`/api/monitors/${created.body.id}`)
      .set('authorization', `Bearer ${intruderToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/monitors/${created.body.id}`)
      .set('authorization', `Bearer ${intruderToken}`)
      .send({ keyword: 'hacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/monitors/${created.body.id}`)
      .set('authorization', `Bearer ${intruderToken}`)
      .expect(404);
    // 数据未被篡改
    const stored = await prisma.keywordMonitor.findUnique({ where: { id: created.body.id } });
    expect(stored?.keyword).toBe('iPhone 15 Pro');
  });

  it('非法字段被拒绝（400）', async () => {
    const token = await registerAndLogin('invalid@example.com');
    await request(app.getHttpServer())
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send({ ...monitorBody, frequencyMinutes: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send({ ...monitorBody, targetPriceCent: -100 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/monitors')
      .set('authorization', `Bearer ${token}`)
      .send({ ...monitorBody, discountThreshold: 1.5 })
      .expect(400);
  });

  it('未登录访问返回 401', async () => {
    await request(app.getHttpServer()).get('/api/monitors').expect(401);
  });
});
