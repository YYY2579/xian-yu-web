/**
 * 鉴权 DTO 与类型（API-002）
 */

export type RegisterRequest = {
  email: string;
  password: string;
  displayName?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

/** 用户公开视图（绝不包含密码哈希） */
export type UserView = {
  id: string;
  email: string;
  displayName: string | null;
  planCode: string;
  createdAt: string;
};
