/**
 * 监控任务类型（API-003）
 * 金额对外使用 number（整数分；业务金额远小于 2^53 安全），
 * 数据库层为 BIGINT。
 */

export type MonitorView = {
  id: string;
  keyword: string;
  targetPriceCent: number;
  discountThreshold: number;
  minSampleSize: number;
  frequencyMinutes: number;
  status: string;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateMonitorRequest = {
  keyword: string;
  targetPriceCent: number;
  discountThreshold?: number;
  minSampleSize?: number;
  frequencyMinutes: number;
  categoryCode?: string;
};

export type UpdateMonitorRequest = Partial<CreateMonitorRequest>;

export type MonitorPage = {
  items: MonitorView[];
  total: number;
  page: number;
  pageSize: number;
};
