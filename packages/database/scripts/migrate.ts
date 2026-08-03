/**
 * 数据库迁移入口（DB-005）
 * 用法：node scripts/migrate.ts（Node 24 原生 type stripping 直跑 TS）
 * - 幂等：prisma migrate deploy 只应用未执行的迁移（空库从零迁移、已有库升级不丢数据）。
 * - 迁移后重新生成 client，保证模型与数据库一致。
 * 需要 DATABASE_URL（缺失即失败并给出明确提示）。
 */

const env = { ...process.env };

if (!env.DATABASE_URL) {
  console.error('[db] 缺少 DATABASE_URL 环境变量，无法执行迁移');
  process.exit(1);
}

const { execFileSync } = await import('node:child_process');

console.log('[db] 执行 prisma migrate deploy ...');
execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit', env });

console.log('[db] 重新生成 prisma client ...');
execFileSync('pnpm', ['exec', 'prisma', 'generate'], { stdio: 'inherit', env });

console.log('[db] 迁移完成');
