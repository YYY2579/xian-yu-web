/** 注入令牌：JWT 签名密钥（由 AuthModule 提供，读取 process.env.JWT_SECRET） */
export const JWT_SECRET_TOKEN = 'JWT_SECRET';

/** 从环境读取 JWT 密钥（缺失即抛错） */
export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET 未配置（auth 模块需要）');
  }
  return secret;
}
