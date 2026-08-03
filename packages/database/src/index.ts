export type {
  KeywordMonitor,
  MonitorStatus,
  NotificationDeliveryStatus,
  NotificationRecord,
  Product,
  ProductPriceHistory,
  User,
} from '@prisma/client';
export type { CreateAuditInput } from './repositories/audit.repository';
export { AuditRepository } from './repositories/audit.repository';
export type { ComparablePriceQuery } from './repositories/baseline.repository';
export { BaselineRepository } from './repositories/baseline.repository';
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
export type { CreateNotificationInput } from './repositories/notification.repository';
export {
  NotificationAlreadyExistsError,
  NotificationRepository,
} from './repositories/notification.repository';
export type { RecordPriceInput } from './repositories/price-history.repository';
export { PriceHistoryRepository } from './repositories/price-history.repository';
export type {
  ProductWithoutRawPayload,
  UpsertProductInput,
} from './repositories/product.repository';
export { buildCanonicalKey, ProductRepository } from './repositories/product.repository';
export { RunRepository } from './repositories/run.repository';
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
