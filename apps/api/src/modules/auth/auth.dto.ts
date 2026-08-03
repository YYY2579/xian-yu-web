import type { LoginRequest, RegisterRequest } from '@xianyu/contracts';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** 注册请求 DTO（全局 ValidationPipe 校验） */
export class RegisterDto implements RegisterRequest {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}

/** 登录请求 DTO */
export class LoginDto implements LoginRequest {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
