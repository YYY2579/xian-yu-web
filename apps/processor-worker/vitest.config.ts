import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // 集成测试共享同一嵌入式 PostgreSQL，必须串行执行避免互相清库
    fileParallelism: false,
  },
});
