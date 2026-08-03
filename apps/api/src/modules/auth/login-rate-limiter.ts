import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * 登录限流（API-002）
 * 邮箱维度固定窗口：15 分钟内失败 5 次即锁定（返回 429）。
 */

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const FAIL_PREFIX = 'login-fail:';
const LOCK_PREFIX = 'login-lock:';

export class LoginRateLimiter {
  constructor(@Inject(Redis) private readonly redis: Redis) {}

  /** 检查是否被锁定（锁定返回 true） */
  async isLocked(email: string): Promise<boolean> {
    return (await this.redis.exists(`${LOCK_PREFIX}${email}`)) === 1;
  }

  /** 记录一次登录失败；达到阈值则锁定 */
  async recordFailure(email: string): Promise<{ locked: boolean; remaining: number }> {
    const key = `${FAIL_PREFIX}${email}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }
    if (count >= MAX_FAILURES) {
      await this.redis.set(`${LOCK_PREFIX}${email}`, '1', 'EX', WINDOW_SECONDS);
      await this.redis.del(key);
      return { locked: true, remaining: 0 };
    }
    return { locked: false, remaining: MAX_FAILURES - count };
  }

  /** 登录成功后清零失败计数 */
  async reset(email: string): Promise<void> {
    await this.redis.del(`${FAIL_PREFIX}${email}`);
    await this.redis.del(`${LOCK_PREFIX}${email}`);
  }
}
