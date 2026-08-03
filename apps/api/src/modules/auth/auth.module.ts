import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { createPrismaClient, UserRepository } from '@xianyu/database';
import Redis from 'ioredis';
import { AccessTokenGuard } from './access-token.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { JWT_SECRET_TOKEN } from './tokens';

function requireSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET 未配置（auth 模块需要）');
  }
  return secret;
}

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenGuard,
    LoginRateLimiter,
    { provide: JWT_SECRET_TOKEN, useFactory: requireSecret },
    {
      provide: UserRepository,
      useFactory: () => new UserRepository(createPrismaClient(process.env.DATABASE_URL ?? '')),
    },
    {
      provide: Redis,
      useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'),
    },
  ],
})
export class AuthModule {}
