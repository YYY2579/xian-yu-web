import { PrismaClient } from '@prisma/client';

export type { KeywordMonitor, MonitorStatus, User } from '@prisma/client';
export type {
  CreateMonitorInput,
  Paged,
  UpdateMonitorInput,
} from './repositories/monitor.repository';
export {
  MonitorRepository,
  MonitorValidationError,
  normalizeKeyword,
} from './repositories/monitor.repository';
export type { CreateUserInput, UpdateUserInput } from './repositories/user.repository';
export {
  createPrismaClient,
  EmailAlreadyExistsError,
  UserRepository,
} from './repositories/user.repository';

/** 供测试/脚本便捷创建 client 的连接类型 */
export type DatabaseUrl = string;

// 保留默认导出对象，避免破坏骨架占位（index.spec.ts 已迁移至仓储集成测试）
export const database = {
  placeholder: (): string => 'xianyu database package',
};
