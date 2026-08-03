import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // RabbitMQ 集成测试共享同一实例，串行避免队列互相干扰
    fileParallelism: false,
  },
});
