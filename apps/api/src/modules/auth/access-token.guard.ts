import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { JWT_SECRET_TOKEN } from './tokens';

/**
 * AccessToken 守卫（API-002）
 * 校验 Authorization: Bearer <access_token>，将 userId 挂到请求对象。
 */

export type AuthenticatedRequest = Request & { userId?: string };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(JWT_SECRET_TOKEN) private readonly jwtSecret: string,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('missing access token');
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; type?: string }>(token, {
        secret: this.jwtSecret,
      });
      if (payload.type !== 'access' || !payload.sub) {
        throw new UnauthorizedException('invalid token');
      }
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('invalid or expired access token');
    }
  }
}
