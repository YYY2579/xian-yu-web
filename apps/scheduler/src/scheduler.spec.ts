import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient, MonitorRepository } from '@xianyu/database';
import Redis from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DistributedLock } from './locks';
import { QuotaManager } from './quota';
import { SchedulerService } from './scheduler.service';

// 测试依赖：嵌入式 PostgreSQL（端口 55432）+ docker compose 的 Redis（localhost:6379，db 5）
const PG_PORT = 55432;
const PG_DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PG_PORT}/${PG_DB}`;
const REDIS_URL = 'redis://localhost:6379';
const REDIS_PASSWORD = 'xianyu_dev_redis';

let redis: Redis;
let prisma!: PrismaClient;
let monitors: MonitorRepository;
let locks: DistributedLock;
let quota: QuotaManager;
let scheduler: SchedulerService;
let userId: string;
let dueMonitorId: string;
let futureMonitorId: string;

async function createMonitor(user: string, keyword: string, nextRunAt: Date): Promise<string> {
  const m = await monitors.create({
    userId: user,
    keyword,
    targetPriceCent: 1_000_00n,
    frequencyMinutes: 30,
  });
  await redis.del(`lock:monitor:${m.id}`);
  // 手动设置 nextRunAt 以精确控制到期边界
  await prisma.keywordMonitor.update({ where: { id: m.id }, data: { nextRunAt } });
  return m.id;
}

// pnpm 在包目录（apps/scheduler）运行 vitest；数据库基建在 packages/database
const PKG_ROOT = process.cwd();
const DB_PKG = path.resolve(PKG_ROOT, '../../packages/database');

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
  redis = new Redis({ host: 'localhost', port: 6379, password: REDIS_PASSWORD, db: 5 });
  locks = new DistributedLock(redis);
  quota = new QuotaManager(redis);
  scheduler = new SchedulerService({ monitors, locks, quota });
});

beforeEach(async () => {
  await redis.flushdb();
  await prisma.keywordMonitor.deleteMany({});
  await prisma.user.deleteMany({});
  const user = await prisma.user.create({
    data: { email: 'sched@example.com', passwordHash: 'h' },
  });
  userId = user.id;
  dueMonitorId = await createMonitor(userId, 'iPhone 15', new Date(Date.now() - 60_000));
  futureMonitorId = await createMonitor(userId, 'Sony A7M4', new Date(Date.now() + 60 * 60_000));
});

afterAll(async () => {
  await redis?.quit();
});

describe('DistributedLock', () => {
  it('同一锁只允许一个持有者（并发互斥）', async () => {
    const first = await locks.acquire('monitor:x', { ttlMs: 5000 });
    expect(first).not.toBeNull();
    const second = await locks.acquire('monitor:x', { ttlMs: 5000 });
    expect(second).toBeNull();
    expect(await locks.isHeld('monitor:x')).toBe(true);
  });

  it('release 校验 owner，他人无法释放', async () => {
    const first = await locks.acquire('monitor:y', { ttlMs: 5000, owner: 'owner-a' });
    expect(first?.owner).toBe('owner-a');
    expect(await locks.release('monitor:y', 'owner-b')).toBe(false); // 错误 owner
    expect(await locks.isHeld('monitor:y')).toBe(true);
    expect(await locks.release('monitor:y', 'owner-a')).toBe(true); // 正确 owner
    expect(await locks.isHeld('monitor:y')).toBe(false);
  });

  it('锁 TTL 过期后自动释放', async () => {
    const lock = await locks.acquire('monitor:z', { ttlMs: 100 });
    expect(lock).not.toBeNull();
    await new Promise((r) => setTimeout(r, 250)); // 等待过期
    expect(await locks.isHeld('monitor:z')).toBe(false);
    expect(await locks.acquire('monitor:z', { ttlMs: 5000 })).not.toBeNull();
  });
});

describe('SchedulerService 任务选择', () => {
  it('只选择到期的启用任务，产出 CollectorJob', async () => {
    const result = await scheduler.runCycle();
    const jobIds = result.jobs.map((j) => j.monitor_id);
    expect(jobIds).toContain(dueMonitorId);
    expect(jobIds).not.toContain(futureMonitorId); // 未到期不选（时间边界）
    expect(result.jobs[0]?.keyword).toBe('iPhone 15');
    expect(result.jobs[0]?.attempt).toBe(1);
    expect(result.jobs[0]?.source).toBe('authorized-source');
  });

  it('同一监控任务被锁定时跳过（并发不重复执行）', async () => {
    // 模拟另一实例正在执行该任务：预持有锁
    const lock = await locks.acquire(`monitor:${dueMonitorId}`, { ttlMs: 60_000 });
    expect(lock).not.toBeNull();

    const result = await scheduler.runCycle();
    expect(result.jobs.map((j) => j.monitor_id)).not.toContain(dueMonitorId);
    expect(result.skipped).toContainEqual({ monitorId: dueMonitorId, reason: 'locked' });
  });

  it('配额耗尽时任务延期而非丢失', async () => {
    const result = await scheduler.runCycle({
      quota: { source: 'authorized-source', windowSec: 60, limit: 0 },
    });
    expect(result.jobs).toHaveLength(0);
    expect(result.skipped).toContainEqual({ monitorId: dueMonitorId, reason: 'quota_exhausted' });
    // 任务仍在库中（未删除），下周期可重试
    expect(await prisma.keywordMonitor.count({ where: { id: dueMonitorId } })).toBe(1);
  });

  it('配额允许时正常产出 job', async () => {
    const result = await scheduler.runCycle({
      quota: { source: 'authorized-source', windowSec: 60, limit: 10 },
    });
    expect(result.jobs.map((j) => j.monitor_id)).toContain(dueMonitorId);
    expect(result.skipped).toHaveLength(0);
  });
});

describe('QuotaManager', () => {
  it('固定窗口内计数，超限拒绝且剩余为 0', async () => {
    const now = 1_700_000_000_000;
    const first = await quota.consume('src-a', { windowSec: 60, limit: 2, now });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = await quota.consume('src-a', { windowSec: 60, limit: 2, now });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    const third = await quota.consume('src-a', { windowSec: 60, limit: 2, now });
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);

    // 下一窗口重置
    const nextWindow = await quota.consume('src-a', { windowSec: 60, limit: 2, now: now + 60_000 });
    expect(nextWindow.allowed).toBe(true);
  });
});
