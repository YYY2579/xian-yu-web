import { existsSync } from 'node:fs';
import dotenv from 'dotenv';

/**
 * 按环境加载 .env 文件：
 * - 总是先加载 `.env`（不覆盖已有环境变量）。
 * - 若存在 `.env.<NODE_ENV>`（如 .env.test），后加载并覆盖同名项。
 * 仅在仓库根目录运行时生效；缺失文件时静默跳过。
 */
export function applyDotenvFiles(nodeEnv?: string): void {
  if (existsSync('.env')) {
    dotenv.config({ path: '.env', override: false });
  }
  const envFile = nodeEnv ? `.env.${nodeEnv}` : '';
  if (envFile && existsSync(envFile)) {
    dotenv.config({ path: envFile, override: true });
  }
}
