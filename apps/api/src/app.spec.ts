import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

// 测试依赖：嵌入式 PostgreSQL（55432）+ docker Redis（6379）
process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:55432/xianyu_test';
process.env.REDIS_URL = 'redis://:xianyu_dev_redis@localhost:6379';

const DB_PKG = path.resolve(process.cwd(), '../../packages/database');

let app: INestApplication;

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
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
});

describe('API 基础（API-001）', () => {
  it('GET /api/health 返回应用与依赖状态', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    const body = res.body as { status: string; checks: Array<{ name: string; status: string }> };
    expect(['ok', 'degraded']).toContain(body.status);
    const names = body.checks.map((c) => c.name);
    expect(names).toContain('postgres');
    expect(names).toContain('redis');
  });

  it('未知路由返回统一错误结构（404）', async () => {
    const res = await request(app.getHttpServer()).get('/api/not-exist').expect(404);
    expect(res.body).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
      path: '/api/not-exist',
      timestamp: expect.any(String),
    });
  });

  it('请求 ID 头透传', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', 'req-abc-123')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('req-abc-123');
  });
});
