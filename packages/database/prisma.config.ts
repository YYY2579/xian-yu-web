import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 CLI 配置（FND-003 配置契约）
 * - 连接串从环境变量 DATABASE_URL 读取（schema 中不再声明 url）。
 * - 运行 migrate/db push/studio 时需提供 DATABASE_URL（如通过 .env 或 shell 环境）。
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
