import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateMonitorRequest,
  MonitorPage,
  MonitorView,
  UpdateMonitorRequest,
} from '@xianyu/contracts';
import { type KeywordMonitor, MonitorRepository, MonitorValidationError } from '@xianyu/database';

/**
 * 监控任务服务（API-003）
 * - 所有查询绑定 userId（所有权隔离：他人任务不可见/不可改）。
 * - 金额 bigint -> number（对外 JSON 安全）。
 */

@Injectable()
export class MonitorsService {
  constructor(@Inject(MonitorRepository) private readonly monitors: MonitorRepository) {}

  async list(userId: string, page = 1, pageSize = 20): Promise<MonitorPage> {
    const result = await this.monitors.listByUser(userId, page, pageSize);
    return {
      items: result.items.map((m) => this.toView(m)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async get(userId: string, id: string): Promise<MonitorView> {
    const monitor = await this.owned(userId, id);
    return this.toView(monitor);
  }

  async create(userId: string, input: CreateMonitorRequest): Promise<MonitorView> {
    try {
      const monitor = await this.monitors.create({ userId, ...input });
      return this.toView(monitor);
    } catch (err) {
      throw this.translate(err);
    }
  }

  async update(userId: string, id: string, input: UpdateMonitorRequest): Promise<MonitorView> {
    await this.owned(userId, id);
    try {
      const monitor = await this.monitors.update(id, input);
      return this.toView(monitor);
    } catch (err) {
      throw this.translate(err);
    }
  }

  async pause(userId: string, id: string): Promise<MonitorView> {
    await this.owned(userId, id);
    return this.toView(await this.monitors.pause(id));
  }

  async resume(userId: string, id: string): Promise<MonitorView> {
    await this.owned(userId, id);
    return this.toView(await this.monitors.resume(id));
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    // 通知/运行记录级联删除（schema 已配置 ON DELETE CASCADE）
    await this.monitors.remove(id);
  }

  /** 校验任务属于当前用户（他人任务按 404 处理，避免泄露存在性） */
  private async owned(userId: string, id: string): Promise<KeywordMonitor> {
    const monitor = await this.monitors.findById(id);
    if (!monitor || monitor.userId !== userId) {
      throw new NotFoundException('monitor not found');
    }
    return monitor;
  }

  private translate(err: unknown): Error {
    if (err instanceof MonitorValidationError) {
      return new BadRequestException(err.message);
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  private toView(m: KeywordMonitor): MonitorView {
    return {
      id: m.id,
      keyword: m.keyword,
      targetPriceCent: Number(m.targetPriceCent),
      discountThreshold: Number(m.discountThreshold),
      minSampleSize: m.minSampleSize,
      frequencyMinutes: m.frequencyMinutes,
      status: m.status,
      nextRunAt: m.nextRunAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }
}
