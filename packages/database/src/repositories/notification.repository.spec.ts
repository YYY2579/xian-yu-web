import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditRepository } from './audit.repository';
import { NotificationAlreadyExistsError, NotificationRepository } from './notification.repository';
import { RunRepository } from './run.repository';
import { createPrismaClient } from './user.repository';

// pnpm 在包目录下运行 vitest，进程工作目录即包根
const PKG_ROOT = process.cwd();
const PORT = 55432;
const DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${DB}`;

let prisma: PrismaClient;
let notifications: NotificationRepository;
let runs: RunRepository;
let audits: AuditRepository;

let userId: string;
let monitorId: string;
let productId: string;

const notifBase = {
  channel: 'in-app',
  eventType: 'low_price',
  ruleVersion: 'rule-v1',
  productPriceCent: 5_999_00n,
  marketPriceCent: 7_000_00n,
  discountRate: 0.85,
  reason: { rule: 'below user target', sampleSize: 12 },
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
  notifications = new NotificationRepository(prisma);
  runs = new RunRepository(prisma);
  audits = new AuditRepository(prisma);
});

beforeEach(async () => {
  await prisma.notificationRecord.deleteMany({});
  await prisma.monitorRun.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.productPriceHistory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.keywordMonitor.deleteMany({});
  await prisma.user.deleteMany({});

  const user = await prisma.user.create({
    data: { email: 'owner@example.com', passwordHash: 'h' },
  });
  userId = user.id;
  const monitor = await prisma.keywordMonitor.create({
    data: {
      userId,
      keyword: 'iPhone 15 Pro',
      normalizedKeyword: 'iphone 15 pro',
      targetPriceCent: 6_000_00n,
      discountThreshold: '0.7000',
      minSampleSize: 10,
      frequencyMinutes: 30,
    },
  });
  monitorId = monitor.id;
  const product = await prisma.product.create({
    data: {
      source: 'authorized-source',
      sourceProductId: 'SRC-PROD-001',
      canonicalKey: 'authorized-source:SRC-PROD-001',
      title: 'iPhone 15 Pro',
      normalizedTitle: 'iphone 15 pro',
      url: 'https://example.com/item/1',
      currentPriceCent: 5_999_00n,
      lastSeenAt: new Date(),
    },
  });
  productId = product.id;
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('NotificationRepository 幂等', () => {
  it('相同 idempotency_key 只能成功插入一条', async () => {
    const key = 'user:monitor:product:rule-v1:5999-5700';
    const first = await notifications.create({
      ...notifBase,
      userId,
      monitorId,
      productId,
      idempotencyKey: key,
    });
    expect(first.deliveryStatus).toBe('PENDING');

    await expect(
      notifications.create({ ...notifBase, userId, monitorId, productId, idempotencyKey: key }),
    ).rejects.toBeInstanceOf(NotificationAlreadyExistsError);
    expect(await prisma.notificationRecord.count()).toBe(1);
  });

  it('findByKey 命中已有幂等记录', async () => {
    const key = 'unique-key-1';
    await notifications.create({ ...notifBase, userId, monitorId, productId, idempotencyKey: key });
    const found = await notifications.findByKey(key);
    expect(found?.eventType).toBe('low_price');
    expect(Number(found?.discountRate)).toBe(0.85);
    expect(await notifications.findByKey('missing')).toBeNull();
  });
});

describe('NotificationRepository 状态流转与重试', () => {
  it('PENDING -> SENT', async () => {
    const n = await notifications.create({
      ...notifBase,
      userId,
      monitorId,
      productId,
      idempotencyKey: 'k-sent',
    });
    const sent = await notifications.markSent(n.id, 'provider-msg-1');
    expect(sent.deliveryStatus).toBe('SENT');
    expect(sent.providerMessageId).toBe('provider-msg-1');
    expect(sent.sentAt).not.toBeNull();
  });

  it('失败重试自增 retry_count，超过后进入死信', async () => {
    const n = await notifications.create({
      ...notifBase,
      userId,
      monitorId,
      productId,
      idempotencyKey: 'k-fail',
    });
    const failed1 = await notifications.markFailed(n.id);
    expect(failed1.deliveryStatus).toBe('FAILED');
    expect(failed1.retryCount).toBe(1);

    const failed2 = await notifications.markFailed(n.id);
    expect(failed2.retryCount).toBe(2);

    const dead = await notifications.markDead(n.id);
    expect(dead.deliveryStatus).toBe('DEAD');
    expect(dead.retryCount).toBe(2); // 重试计数保留
  });

  it('抑制（免打扰/每日上限）状态', async () => {
    const n = await notifications.create({
      ...notifBase,
      userId,
      monitorId,
      productId,
      idempotencyKey: 'k-suppress',
    });
    const suppressed = await notifications.markSuppressed(n.id);
    expect(suppressed.deliveryStatus).toBe('SUPPRESSED');
  });

  it('listByStatus 按状态拉取待处理通知', async () => {
    await notifications.create({
      ...notifBase,
      userId,
      monitorId,
      productId,
      idempotencyKey: 'k-1',
    });
    await notifications.create({
      ...notifBase,
      userId,
      monitorId,
      productId,
      idempotencyKey: 'k-2',
    });
    const pending = await notifications.listByStatus('PENDING');
    expect(pending).toHaveLength(2);
  });
});

describe('NotificationRepository 用户隔离', () => {
  it('listByUser 只返回当前用户通知', async () => {
    await notifications.create({
      ...notifBase,
      userId,
      monitorId,
      productId,
      idempotencyKey: 'k-owner',
    });

    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'h' },
    });
    const otherMonitor = await prisma.keywordMonitor.create({
      data: {
        userId: other.id,
        keyword: 'Sony A7M4',
        normalizedKeyword: 'sony a7m4',
        targetPriceCent: 15_000_00n,
        discountThreshold: '0.7000',
        frequencyMinutes: 30,
      },
    });
    await prisma.notificationRecord.create({
      data: {
        ...notifBase,
        userId: other.id,
        monitorId: otherMonitor.id,
        productId,
        idempotencyKey: 'k-other',
      },
    });

    const page = await notifications.listByUser(userId);
    expect(page.total).toBe(1);
    expect(page.items[0]?.idempotencyKey).toBe('k-owner');
  });
});

describe('RunRepository', () => {
  it('start -> finish(SUCCESS) 记录结果与耗时', async () => {
    const run = await runs.start(monitorId);
    expect(run.status).toBe('RUNNING');

    const finished = await runs.finish(run.id, {
      status: 'SUCCESS',
      resultCount: 12,
      durationMs: 345,
    });
    expect(finished.status).toBe('SUCCESS');
    expect(finished.resultCount).toBe(12);
    expect(finished.durationMs).toBe(345);
    expect(finished.finishedAt).not.toBeNull();
  });

  it('失败运行记录错误信息，listByMonitor 倒序', async () => {
    const run1 = await runs.start(monitorId);
    await runs.finish(run1.id, { status: 'FAILED', errorMessage: 'rate limited' });
    const run2 = await runs.start(monitorId);
    await runs.finish(run2.id, { status: 'SUCCESS' });

    const list = await runs.listByMonitor(monitorId);
    expect(list).toHaveLength(2);
    expect(list[0]?.status).toBe('SUCCESS'); // 后开始的最新在前
    const failed = await prisma.monitorRun.findUnique({ where: { id: run1.id } });
    expect(failed?.errorMessage).toBe('rate limited');
  });
});

describe('AuditRepository', () => {
  it('只支持追加与查询，无修改/删除方法', async () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(audits));
    expect(methods).toContain('create');
    expect(methods).toContain('list');
    expect(methods).not.toContain('update');
    expect(methods).not.toContain('delete');
  });

  it('create + 按操作者/资源过滤查询', async () => {
    await audits.create({
      actorId: userId,
      action: 'monitor.create',
      resourceType: 'monitor',
      resourceId: monitorId,
      ip: '127.0.0.1',
    });
    await audits.create({ action: 'system.migrate', resourceType: 'system' });

    const byActor = await audits.list({ actorId: userId });
    expect(byActor).toHaveLength(1);
    expect(byActor[0]?.action).toBe('monitor.create');

    const byType = await audits.list({ resourceType: 'system' });
    expect(byType).toHaveLength(1);
    expect(byType[0]?.action).toBe('system.migrate');
  });
});
