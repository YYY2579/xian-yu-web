import { randomUUID } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenPair, UserView } from '@xianyu/contracts';
import { EmailAlreadyExistsError, UserRepository } from '@xianyu/database';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { JWT_SECRET_TOKEN } from './tokens';

/**
 * 鉴权服务（API-002）
 * - 密码使用 bcrypt 强哈希存储（不返回明文/哈希）。
 * - AccessToken（15 分钟 JWT）+ RefreshToken（7 天，jti 存 Redis 可撤销）。
 * - 登出删除 refresh jti（撤销刷新）。
 */

const BCRYPT_ROUNDS = 10;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_PREFIX = 'refresh:';

export class AuthService {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(Redis) private readonly redis: Redis,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(JWT_SECRET_TOKEN) private readonly jwtSecret: string,
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<UserView> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    let user: Awaited<ReturnType<UserRepository['create']>> | null = null;
    try {
      user = await this.users.create({
        email: input.email.toLowerCase(),
        passwordHash,
        displayName: input.displayName,
      });
    } catch (err) {
      if (err instanceof EmailAlreadyExistsError) {
        throw new UnauthorizedException('email already registered');
      }
      throw err;
    }
    return this.toView(user);
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: UserView; tokens: TokenPair }> {
    const user = await this.users.findByEmail(input.email.toLowerCase());
    if (!user) {
      throw new UnauthorizedException('invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('account disabled');
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('invalid credentials');
    }
    const tokens = await this.issueTokens(user.id);
    return { user: this.toView(user), tokens };
  }

  /** 查询当前用户公开视图（me 接口；禁用/不存在抛 401） */
  async userViewOf(userId: string): Promise<UserView> {
    const user = await this.users.findById(userId);
    if (user?.status !== 'ACTIVE') {
      throw new UnauthorizedException('user not found or disabled');
    }
    return this.toView(user);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<{ jti?: string }>(refreshToken, {
        secret: this.jwtSecret,
      });
      if (payload.jti) {
        await this.redis.del(`${REFRESH_PREFIX}${payload.jti}`);
      }
    } catch {
      // 无效 token 忽略（登出幂等）
    }
  }

  /** 校验刷新令牌并签发新令牌对 */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub?: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string; jti?: string }>(refreshToken, {
        secret: this.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    if (!payload.sub || !payload.jti) {
      throw new UnauthorizedException('invalid refresh token');
    }
    const stored = await this.redis.get(`${REFRESH_PREFIX}${payload.jti}`);
    if (stored !== payload.sub) {
      throw new UnauthorizedException('refresh token revoked');
    }
    // 撤销旧 jti，签发新对（轮换）
    await this.redis.del(`${REFRESH_PREFIX}${payload.jti}`);
    return this.issueTokens(payload.sub);
  }

  private async issueTokens(userId: string): Promise<TokenPair> {
    const jti = randomUUID();
    const access_token = await this.jwt.signAsync(
      { sub: userId, type: 'access' },
      { secret: this.jwtSecret, expiresIn: ACCESS_TTL_SECONDS },
    );
    const refresh_token = await this.jwt.signAsync(
      { sub: userId, type: 'refresh', jti },
      { secret: this.jwtSecret, expiresIn: REFRESH_TTL_SECONDS },
    );
    await this.redis.set(`${REFRESH_PREFIX}${jti}`, userId, 'EX', REFRESH_TTL_SECONDS);
    return { access_token, refresh_token, expires_in: ACCESS_TTL_SECONDS };
  }

  private toView(user: {
    id: string;
    email: string;
    displayName: string | null;
    planCode: string;
    createdAt: Date;
  }): UserView {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      planCode: user.planCode,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
