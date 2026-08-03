import { randomUUID } from 'crypto';
import type Redis from 'ioredis';

/**
 * Redis 分布式锁（COL-003）
 * - SET NX PX：同一监控任务多实例只允许一个持锁者。
 * - 锁带 TTL（防死锁）；release 用 Lua 校验 owner，防止误释放他人锁。
 */

export type AcquireLockResult = { owner: string } | null;

export class DistributedLock {
  constructor(private readonly redis: Redis) {}

  keyOf(name: string): string {
    return `lock:${name}`;
  }

  /** 获取锁：成功返回 owner token，失败（已被持有）返回 null */
  async acquire(
    name: string,
    options: { ttlMs: number; owner?: string },
  ): Promise<AcquireLockResult> {
    const owner = options.owner ?? randomUUID();
    const result = await this.redis.set(this.keyOf(name), owner, 'PX', options.ttlMs, 'NX');
    return result === 'OK' ? { owner } : null;
  }

  /** 释放锁：仅当 owner 匹配时删除（防误释放） */
  async release(name: string, owner: string): Promise<boolean> {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end`;
    const result = (await this.redis.eval(script, 1, this.keyOf(name), owner)) as number;
    return result === 1;
  }

  /** 锁是否仍被持有 */
  async isHeld(name: string): Promise<boolean> {
    return (await this.redis.exists(this.keyOf(name))) === 1;
  }
}
