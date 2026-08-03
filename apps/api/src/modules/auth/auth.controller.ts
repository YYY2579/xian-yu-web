import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { TokenPair, UserView } from '@xianyu/contracts';
import { AccessTokenGuard, type AuthenticatedRequest } from './access-token.guard';
import type { LoginDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';

/**
 * 鉴权接口（API-002）
 * POST /api/auth/register | login | logout | refresh；GET /api/auth/me（受保护）
 */

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(LoginRateLimiter) private readonly rateLimiter: LoginRateLimiter,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<UserView> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<{ user: UserView; tokens: TokenPair }> {
    if (await this.rateLimiter.isLocked(dto.email)) {
      throw new HttpException('too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      const result = await this.auth.login(dto);
      await this.rateLimiter.reset(dto.email);
      return result;
    } catch (err) {
      await this.rateLimiter.recordFailure(dto.email);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: { refresh_token?: string }): Promise<void> {
    if (body.refresh_token) {
      await this.auth.logout(body.refresh_token);
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: { refresh_token: string }): Promise<TokenPair> {
    return this.auth.refresh(body.refresh_token);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  async me(@Req() request: AuthenticatedRequest): Promise<UserView> {
    // 由模块注入的 users repository 查询（防篡改，避免直接信任 token 内信息之外的字段）
    return this.auth.userViewOf(request.userId ?? '');
  }
}
