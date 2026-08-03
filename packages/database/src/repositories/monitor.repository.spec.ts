import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from './user.repository';
import { MonitorRepository, MonitorValidationError, normalizeKeyword } from './monitor.repository';

// pnpm 在包目录下运行 vitest，进程工作目录即包根
const PKG_ROOT = process.cwd();
const PORT = 55432;
const DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${DB}`;

let prisma: PrismaClient;
let repo: MonitorRepository;
let userId: string;

const baseInput = {
  keyword: 'iPhone 15 Pro',
  targetPriceCent: 6_000_00n, // 6000.00 元，整数分
  discountThreshold: 0.7,
  frequencyMinutes: 30,
};

beforeAll(() => {
  execFileSync(process.execPath, [path.join(PKG_ROOT, 'scripts/embedded-pg.mjs'), 'start', String(PORT), DB], {
    stdio: 'ignore',
  });
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: PKG_ROOT,
    env: { ...process.env, DATABASE_URL },
    stdio: 'ignore',
  });
  prisma = createPrismaClient(DATABASE_URL);
  repo = new MonitorRepository(prisma);
});

beforeEach(async () => {
  await prisma.user.deleteMany({}); // 级联删除 keyword_monitors
  const user = await prisma.user.create({
    data: { email: 'owner@example.com', passwordHash: 'hashed' },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('normalizeKeyword', () => {
  it('去除首尾空白、折叠全角/连续空白、转小写', () => {
    expect(normalizeKeyword('  iPhone 15  Pro ')).toBe('iphone 15 pro');
    expect(normalizeKeyword('索尼\u3000A7M4')).toBe('索尼 a7m4');
  });
});

describe('MonitorRepository.create', () => {
  it('持久化全部字段并生成默认值与 nextRunAt', async () => {
    const m = await repo.create({ userId, ...baseInput });
    expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(m.keyword).toBe('iPhone 15 Pro');
    expect(m.normalizedKeyword).toBe('iphone 15 pro');
    expect(m.targetPriceCent).toBe(6_000_00n);
    expect(Number(m.discountThreshold)).toBe(0.7); // DECIMAL(5,4) 数值等价（toString 会去尾零）
    expect(m.minSampleSize).toBe(10); // 默认
    expect(m.frequencyMinutes).toBe(30);
    expect(m.status).toBe('ACTIVE');
    expect(m.nextRunAt).not.toBeNull();
    expect(m.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('频率/阈值/样本量/金额范围校验', async () => {
    await expect(repo.create({ userId, ...baseInput, frequencyMinutes: 0 })).rejects.toBeInstanceOf(
      MonitorValidationError,
    );
    await expect(repo.create({ userId, ...baseInput, frequencyMinutes: 10_081 })).rejects.toBeInstanceOf(
      MonitorValidationError,
    );
    await expect(repo.create({ userId, ...baseInput, frequencyMinutes: 1.5 })).rejects.toBeInstanceOf(
      MonitorValidationError,
    );
    await expect(repo.create({ userId, ...baseInput, targetPriceCent: -1n })).rejects.toBeInstanceOf(
      MonitorValidationError,
    );
    await expect(repo.create({ userId, ...baseInput, discountThreshold: 1.5 })).rejects.toBeInstanceOf(
      MonitorValidationError,
    );
    await expect(repo.create({ userId, ...baseInput, minSampleSize: 0 })).rejects.toBeInstanceOf(
      MonitorValidationError,
    );
  });
});

describe('MonitorRepository 查询', () => {
  it('findById 命中与未命中', async () => {
    const m = await repo.create({ userId, ...baseInput });
    expect((await repo.findById(m.id))?.id).toBe(m.id);
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('listByUser 分页且按用户隔离', async () => {
    for (let i = 0; i < 3; i++) {
      await repo.create({ userId, ...baseInput, keyword: `Item ${i}` });
    }
    const other = await prisma.user.create({ data: { email: 'other@example.com', passwordHash: 'h' } });
    await repo.create({ userId: other.id, ...baseInput, keyword: 'Other item' });

    const page1 = await repo.listByUser(userId, 1, 2);
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    const page2 = await repo.listByUser(userId, 2, 2);
    expect(page2.items).toHaveLength(1);
    // 只返回该用户的任务
    for (const m of [...page1.items, ...page2.items]) {
      expect(m.userId).toBe(userId);
      expect(m.keyword).not.toBe('Other item');
    }
  });

  it('findByDue 只返回到期任务，PAUSED 不被选中', async () => {
    const due = new Date(Date.now() - 60_000);
    const overdue = await repo.create({ userId, ...baseInput, keyword: 'Overdue', frequencyMinutes: 1 });
    // 手动把 nextRunAt 改到过去
    await prisma.keywordMonitor.update({ where: { id: overdue.id }, data: { nextRunAt: due } });
    await repo.create({ userId, ...baseInput, keyword: 'Future' }); // nextRunAt 在未来

    const dueList = await repo.findByDue(new Date());
    expect(dueList.map((m) => m.keyword)).toEqual(['Overdue']);

    await repo.pause(overdue.id);
    const pausedList = await repo.findByDue(new Date());
    expect(pausedList.map((m) => m.keyword)).toEqual([]); // PAUSED 不参与调度
  });
});

describe('MonitorRepository 状态与更新', () => {
  it('pause / resume 状态转换，resume 重新生成 nextRunAt', async () => {
    const m = await repo.create({ userId, ...baseInput });
    const paused = await repo.pause(m.id);
    expect(paused.status).toBe('PAUSED');

    const oldNextRun = paused.nextRunAt!.getTime();
    const resumed = await repo.resume(m.id);
    expect(resumed.status).toBe('ACTIVE');
    expect(resumed.nextRunAt!.getTime()).toBeGreaterThan(oldNextRun);
  });

  it('update 修改字段并重算 normalizedKeyword', async () => {
    const m = await repo.create({ userId, ...baseInput });
    const updated = await repo.update(m.id, {
      keyword: '  Sony  A7M4  ',
      targetPriceCent: 5_500_00n,
      minSampleSize: 20,
    });
    expect(updated.keyword).toBe('  Sony  A7M4  ');
    expect(updated.normalizedKeyword).toBe('sony a7m4');
    expect(updated.targetPriceCent).toBe(5_500_00n);
    expect(updated.minSampleSize).toBe(20);
  });

  it('update 非法值报错', async () => {
    const m = await repo.create({ userId, ...baseInput });
    await expect(repo.update(m.id, { frequencyMinutes: 0 })).rejects.toBeInstanceOf(MonitorValidationError);
    await expect(repo.update(m.id, { keyword: '   ' })).rejects.toBeInstanceOf(MonitorValidationError);
  });
});
