import { Controller, Get } from '@nestjs/common';
import { createPrismaClient } from '@xianyu/database';
import { aggregateHealth, dependencyCheck, type HealthReport } from '@xianyu/observability';
import Redis from 'ioredis';

/**
 * 健康检查（API-001）
 * /api/health 返回应用与依赖状态（postgres / redis），区分 ok/degraded/down。
 */

@Controller('health')
export class HealthController {
  @Get()
  async check(): Promise<HealthReport> {
    const checks = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    return aggregateHealth(checks);
  }

  private async checkPostgres() {
    const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
    try {
      const started = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      return dependencyCheck('postgres', true, { latencyMs: Date.now() - started });
    } catch (err) {
      return dependencyCheck('postgres', false, {
        detail: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  }

  private async checkRedis() {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: null,
    });
    try {
      const started = Date.now();
      await redis.connect();
      const pong = await redis.ping();
      return dependencyCheck('redis', pong === 'PONG', { latencyMs: Date.now() - started });
    } catch (err) {
      return dependencyCheck('redis', false, {
        detail: err instanceof Error ? err.message : 'unknown',
      });
    } finally {
      await redis.quit().catch(() => {});
    }
  }
}
