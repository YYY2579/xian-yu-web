import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { LowPriceMatchEvent } from '@xianyu/contracts';
import { createPrismaClient, NotificationRepository, UserRepository } from '@xianyu/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotifierService } from './notifier.service';
import { renderInApp, TEMPLATE_VERSION } from './templates/message-templates';

// pnpm 在包目录（apps/notifier-worker）运行 vitest；数据库基建在 packages/database
const DB_PKG = path.resolve(process.cwd(), '../../packages/database');
const PG_PORT = 55432;
const PG_DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PG_PORT}/${PG_DB}`;

let prisma!: PrismaClient;
let notifier: NotifierService;
let userId: string;
let monitorId: string;
let productId: string;

function makeMatch(overrides: Partial<LowPriceMatchEvent> = {}): LowPriceMatchEvent {
  return {
    event_id: 'match-0001',
    schema_version: 1,
    matched_at: '2026-08-03T10:00:00+08:00',
    monitor_id: monitorId,
    product_id: productId,
    canonical_key: 'authorized-source:SRC-001',
    keyword: 'iPhone 15 Pro',
    price_cent: 5_500_00,
    target_price_cent: 6_000_00,
    market_price_cent: 6_500_00,
    discount_rate: 0.846,
    reason: 'below_both_targets',
    score: 0.5,
    risk_score: 0,
    rule_version: 1,
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
  notifier = new NotifierService(
    {
      notifications: new NotificationRepository(prisma),
      users: new UserRepository(prisma),
    },
    (match) => `https://example.com/item/${match.canonical_key}`,
  );
});

beforeEach(async () => {
  await prisma.notificationRecord.deleteMany({});
  await prisma.keywordMonitor.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.user.deleteMany({});

  const user = await prisma.user.create({ data: { email: 'n@example.com', passwordHash: 'h' } });
  userId = user.id;
  const monitor = await prisma.keywordMonitor.create({
    data: {
      userId,
      keyword: 'iPhone 15 Pro',
      normalizedKeyword: 'iphone 15 pro',
      targetPriceCent: 6_000_00n,
      discountThreshold: '0.7000',
      frequencyMinutes: 30,
    },
  });
  monitorId = monitor.id;
  const product = await prisma.product.create({
    data: {
      source: 'authorized-source',
      sourceProductId: 'SRC-001',
      canonicalKey: 'authorized-source:SRC-001',
      title: 'iPhone 15 Pro',
      normalizedTitle: 'iphone 15 pro',
      url: 'https://example.com/item/1',
      currentPriceCent: 5_500_00n,
      lastSeenAt: new Date(),
    },
  });
  productId = product.id;
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('模板渲染（NTF-001）', () => {
  it('站内信包含原因、价格、市场价与链接', () => {
    const rendered = renderInApp({ match: makeMatch(), productUrl: 'https://example.com/item/x' });
    expect(rendered.title).toContain('低价提醒');
    expect(rendered.title).toContain('¥5500.00');
    expect(rendered.body).toContain('当前价：¥5500.00');
    expect(rendered.body).toContain('市场价：¥6500.00');
    expect(rendered.body).toContain('同时低于您的目标价与市场价基线');
    expect(rendered.body).toContain('https://example.com/item/x');
    expect(rendered.body).toContain('规则 v1');
  });

  it('模板版本已定义', () => {
    expect(TEMPLATE_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe('NotifierService（NTF-001）', () => {
  it('命中事件生成通知记录与渠道命令（默认全渠道）', async () => {
    const commands = await notifier.handle(makeMatch(), userId);
    expect(commands).toHaveLength(3); // in-app + email + wecom
    const inApp = commands.find((c) => c.channel === 'in-app');
    expect(inApp?.content.reason).toBe('below_both_targets');
    expect(inApp?.content.url).toContain('authorized-source:SRC-001');
    expect(inApp?.template_version).toBe(TEMPLATE_VERSION);

    expect(await prisma.notificationRecord.count()).toBe(3);
  });

  it('相同事件重复处理不重复通知（幂等）', async () => {
    await notifier.handle(makeMatch(), userId);
    const again = await notifier.handle(makeMatch(), userId);
    expect(again).toHaveLength(0); // 全部幂等跳过
    expect(await prisma.notificationRecord.count()).toBe(3);
  });

  it('用户偏好关闭的渠道不投递', async () => {
    await prisma.user.update({
      where: { id: userId },
      data: {
        notificationPreferences: { channels: { 'in-app': true, email: false, wecom: false } },
      },
    });
    const commands = await notifier.handle(makeMatch(), userId);
    expect(commands.map((c) => c.channel)).toEqual(['in-app']);
    expect(await prisma.notificationRecord.count()).toBe(1);
  });

  it('不存在的用户不产生通知', async () => {
    const commands = await notifier.handle(makeMatch(), '00000000-0000-0000-0000-000000000000');
    expect(commands).toHaveLength(0);
  });
});
