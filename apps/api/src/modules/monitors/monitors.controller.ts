import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { MonitorPage, MonitorView } from '@xianyu/contracts';
import { AccessTokenGuard, type AuthenticatedRequest } from '../auth/access-token.guard';
import type { CreateMonitorDto, UpdateMonitorDto } from './monitors.dto';
import { MonitorsService } from './monitors.service';

/**
 * 监控任务接口（API-003，全部需登录）
 * GET/POST /api/monitors；GET/PATCH/DELETE /api/monitors/:id；
 * POST /api/monitors/:id/pause|resume
 */

@Controller('monitors')
@UseGuards(AccessTokenGuard)
export class MonitorsController {
  constructor(@Inject(MonitorsService) private readonly monitors: MonitorsService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<MonitorPage> {
    return this.monitors.list(request.userId!, Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateMonitorDto,
  ): Promise<MonitorView> {
    return this.monitors.create(request.userId!, dto);
  }

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<MonitorView> {
    return this.monitors.get(request.userId!, id);
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateMonitorDto,
  ): Promise<MonitorView> {
    return this.monitors.update(request.userId!, id, dto);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  async pause(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<MonitorView> {
    return this.monitors.pause(request.userId!, id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  async resume(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<MonitorView> {
    return this.monitors.resume(request.userId!, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.monitors.remove(request.userId!, id);
  }
}
