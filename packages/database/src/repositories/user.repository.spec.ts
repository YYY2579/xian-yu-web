import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient, EmailAlreadyExistsError, UserRepository } from '../index';

// pnpm 在包目录下运行 vitest，进程工作目录即包根
const PKG_ROOT = process.cwd();
const PORT = 55432;
const DB = 'xianyu_test';
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${DB}`;

let prisma: PrismaClient;
let repo: UserRepository;

beforeAll(() => {
  // 1. 确保嵌入式 PostgreSQL 运行（已在运行则复用）
  execFileSync(process.execPath, [path.join(PKG_ROOT, 'scripts/embedded-pg.mjs'), 'start', String(PORT), DB], {
    stdio: 'ignore',
  });
  // 2. 应用迁移（幂等，未应用的才会执行）
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: PKG_ROOT,
    env: { ...process.env, DATABASE_URL },
    stdio: 'ignore',
  });
  prisma = createPrismaClient(DATABASE_URL);
  repo = new UserRepository(prisma);
});

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma?.$disconnect();
});

const userInput = { email: 'alice@example.com', passwordHash: 'hashed-abc', displayName: 'Alice' };

describe('UserRepository', () => {
  it('创建用户：UUID 主键、默认状态/套餐、密码哈希保留', async () => {
    const u = await repo.create(userInput);
    expect(u.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(u.email).toBe('alice@example.com');
    expect(u.passwordHash).toBe('hashed-abc');
    expect(u.status).toBe('ACTIVE');
    expect(u.planCode).toBe('FREE');
    expect(u.deletedAt).toBeNull();
    expect(u.createdAt).toBeInstanceOf(Date);
  });

  it('重复邮箱抛 EmailAlreadyExistsError（唯一约束生效）', async () => {
    await repo.create(userInput);
    await expect(repo.create({ ...userInput, displayName: 'Another' })).rejects.toBeInstanceOf(
      EmailAlreadyExistsError,
    );
  });

  it('按邮箱查询，未找到返回 null', async () => {
    const u = await repo.create(userInput);
    const found = await repo.findByEmail('alice@example.com');
    expect(found?.id).toBe(u.id);
    expect(await repo.findByEmail('nobody@example.com')).toBeNull();
  });

  it('按 id 查询', async () => {
    const u = await repo.create(userInput);
    expect((await repo.findById(u.id))?.email).toBe('alice@example.com');
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('更新用户字段', async () => {
    const u = await repo.create(userInput);
    const updated = await repo.update(u.id, { displayName: 'Alice Updated', timezone: 'UTC' });
    expect(updated.displayName).toBe('Alice Updated');
    expect(updated.timezone).toBe('UTC');
  });

  it('禁用用户', async () => {
    const u = await repo.create(userInput);
    const disabled = await repo.disable(u.id);
    expect(disabled.status).toBe('DISABLED');
  });

  it('软删除后常规查询不可见', async () => {
    const u = await repo.create(userInput);
    await repo.softDelete(u.id);
    expect(await repo.findById(u.id)).toBeNull();
    expect(await repo.findByEmail('alice@example.com')).toBeNull();
  });
});
