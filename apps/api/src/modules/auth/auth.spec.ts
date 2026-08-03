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
process.env.JWT_SECRET = 'test-jwt-secret-for-api-002';

const DB_PKG = path.resolve(process.cwd(), '../../packages/database');

let app: INestApplication;
let prisma: ReturnType<typeof createPrismaClient>;
let redis: Redis;

const registerBody = {
  email: 'user@example.com',
  password: 'password123',
  displayName: 'Test User',
};

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
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await redis?.quit();
});

describe('注册与登录（API-002）', () => {
  it('注册成功后密码为哈希且可登录', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(registerBody)
      .expect(201);
    expect(reg.body).toMatchObject({ email: 'user@example.com', displayName: 'Test User' });
    expect(reg.body).not.toHaveProperty('passwordHash');
    expect(reg.body).not.toHaveProperty('password');

    const stored = await prisma.user.findUnique({ where: { email: 'user@example.com' } });
    expect(stored?.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt
    expect(stored?.passwordHash).not.toContain('password123');

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: registerBody.email, password: registerBody.password })
      .expect(200);
    expect(login.body.tokens.access_token).toBeTruthy();
    expect(login.body.tokens.refresh_token).toBeTruthy();
  });

  it('重复邮箱注册返回 401（已注册）', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(registerBody).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send(registerBody).expect(401);
  });

  it('错误密码登录失败', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(registerBody).expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: registerBody.email, password: 'wrong-password' })
      .expect(401);
  });

  it('禁用用户不能登录', async () => {
    const user = await prisma.user.create({
      data: { email: 'disabled@example.com', passwordHash: 'x', status: 'DISABLED' },
    });
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: user.email, password: 'whatever' })
      .expect(401);
  });

  it('me 返回当前用户且不含密码字段', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(registerBody).expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: registerBody.email, password: registerBody.password })
      .expect(200);
    const accessToken = login.body.tokens.access_token as string;

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.email).toBe('user@example.com');
    expect(JSON.stringify(me.body)).not.toContain('password');

    // 无 token 拒绝
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('refresh 轮换令牌，logout 后 refresh 失效', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(registerBody).expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: registerBody.email, password: registerBody.password })
      .expect(200);
    const refreshToken = login.body.tokens.refresh_token as string;

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(200);
    expect(refreshed.body.access_token).toBeTruthy();
    expect(refreshed.body.refresh_token).not.toBe(refreshToken); // 轮换

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .send({ refresh_token: refreshToken })
      .expect(204);
    // 旧 refresh 已撤销
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refresh_token: refreshToken })
      .expect(401);
  });
});

describe('登录限流（API-002）', () => {
  it('连续失败 5 次后锁定（429）', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'ratelimit@example.com', password: 'wrong' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'ratelimit@example.com', password: 'wrong' })
      .expect(429);
  });
});
