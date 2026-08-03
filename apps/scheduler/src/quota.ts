import type Redis from 'ioredis';

/**
 * 数据源配额检查（COL-003）
 * 固定窗口计数器：INCR + 首设 EXPIRE；超限返回 allowed=false（任务延期而非丢失）。
 */

export type QuotaConsumeResult = {
  allowed: boolean;
  /** 本次消耗后的剩余额度 */
  remaining: number;
  windowSec: number;
};

export class QuotaManager {
  constructor(private readonly redis: Redis) {}

  windowKey(source: string, windowSec: number, now: number): string {
    const windowIndex = Math.floor(now / (windowSec * 1000));
    return `quota:${source}:${windowIndex}`;
  }

  /** 占用一次配额并返回是否允许 */
  async consume(
    source: string,
    options: { windowSec: number; limit: number; now?: number },
  ): Promise<QuotaConsumeResult> {
    const now = options.now ?? Date.now();
    const key = this.windowKey(source, options.windowSec, now);
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, options.windowSec);
    }
    const allowed = count <= options.limit;
    return { allowed, remaining: Math.max(0, options.limit - count), windowSec: options.windowSec };
  }
}
