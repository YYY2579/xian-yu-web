// 嵌入式 PostgreSQL 管理脚本（测试基建）——原生 initdb/pg_ctl 实现
// 用法: node embedded-pg.mjs start [port] [dbname]   → 启动并确保数据库存在，输出连接 URI
//       node embedded-pg.mjs stop                    → 停止实例（fast）
// 数据目录固定在 /tmp/xianyu-pg，端口默认 55432，账号 postgres（trust 认证）。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const PG_DIR = '/tmp/xianyu-pg';
const PORT = Number(process.argv[3] ?? '55432');
const DB_NAME = process.argv[4] ?? 'xianyu_dev';

function findPnpmRoot() {
  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, 'node_modules/.pnpm');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('未找到 node_modules/.pnpm，请先 pnpm install');
    dir = parent;
  }
}

function findPgBin() {
  const pnpmDir = findPnpmRoot();
  const cands = readdirSync(pnpmDir)
    .filter((n) => n.startsWith('@embedded-postgres+darwin-x64@'))
    .sort();
  if (cands.length === 0) throw new Error('未找到 @embedded-postgres 二进制，请安装 embedded-postgres');
  // 项目技术方案锁定 PostgreSQL 16，优先选择 16.4.0 包（18 beta 为残留孤儿）
  const chosen = cands.find((n) => n.includes('16.4.0')) ?? cands[cands.length - 1];
  const bin = path.join(pnpmDir, chosen, 'node_modules/@embedded-postgres/darwin-x64/native/bin');
  if (!existsSync(path.join(bin, 'pg_ctl'))) throw new Error('pg_ctl 缺失: ' + bin);
  return bin;
}

const BIN = findPgBin();
const run = (tool, args) => execFileSync(path.join(BIN, tool), args, { stdio: 'inherit' });

function isListening() {
  return new Promise((resolve) => {
    const s = net.connect(PORT, 'localhost');
    s.setTimeout(2000);
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('error', () => resolve(false));
    s.once('timeout', () => {
      s.destroy();
      resolve(false);
    });
  });
}

const cmd = process.argv[2];

async function main() {
  if (cmd === 'start') {
    if (!existsSync(path.join(PG_DIR, 'PG_VERSION'))) {
      console.log('初始化数据目录...');
      run('initdb', ['-D', PG_DIR, '-U', 'postgres', '--auth=trust']);
    }
    if (await isListening()) {
      console.log(`PostgreSQL 已在运行（端口 ${PORT}）`);
    } else {
      run('pg_ctl', ['-D', PG_DIR, '-l', path.join(PG_DIR, 'pg.log'), '-o', `-p ${PORT}`, '-w', 'start']);
      console.log(`PostgreSQL 已启动（端口 ${PORT}）`);
    }
    try {
      run('createdb', ['-h', 'localhost', '-p', String(PORT), '-U', 'postgres', DB_NAME]);
    } catch {
      // 已存在
    }
    console.log(`postgres://postgres:postgres@localhost:${PORT}/${DB_NAME}`);
  } else if (cmd === 'stop') {
    run('pg_ctl', ['-D', PG_DIR, '-m', 'fast', '-w', 'stop']);
    console.log('PostgreSQL 已停止');
  } else {
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('embedded-pg error:', err.message);
  process.exit(1);
});
