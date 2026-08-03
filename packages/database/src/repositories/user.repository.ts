import { Prisma, PrismaClient, User } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * 用户仓储（DB-001）
 * - 查询默认过滤软删除（deletedAt IS NULL）。
 * - 唯一约束冲突（邮箱重复）转换为业务错误 EmailAlreadyExistsError。
 * - 密码只接受已哈希的值（passwordHash），本层不做哈希。
 */

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  displayName?: string;
  timezone?: string;
};

export type UpdateUserInput = Partial<{
  displayName: string | null;
  timezone: string;
  notificationPreferences: Prisma.InputJsonValue;
}>;

/** 邮箱唯一约束冲突（P2002） */
export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`user with email ${email} already exists`);
    this.name = 'EmailAlreadyExistsError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateUserInput): Promise<User> {
    try {
      return await this.prisma.user.create({ data: input });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new EmailAlreadyExistsError(input.email);
      }
      throw err;
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  async update(id: string, data: UpdateUserInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /** 禁用用户（status -> DISABLED） */
  async disable(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { status: 'DISABLED' } });
  }

  /** 软删除：写入 deletedAt，常规查询不再可见 */
  async softDelete(id: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}

/** 创建带 driver adapter 的 PrismaClient（Prisma 7 运行时连接方式） */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
