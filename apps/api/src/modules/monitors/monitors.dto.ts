import type { CreateMonitorRequest, UpdateMonitorRequest } from '@xianyu/contracts';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 创建监控任务 DTO（范围校验与 MonitorRepository 一致） */
export class CreateMonitorDto implements CreateMonitorRequest {
  @IsString()
  @MaxLength(200)
  keyword!: string;

  @IsInt()
  @Min(0)
  targetPriceCent!: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'discountThreshold must be > 0' })
  @Max(1)
  discountThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minSampleSize?: number;

  @IsInt()
  @Min(1)
  @Max(10080)
  frequencyMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryCode?: string;
}

/** 更新监控任务 DTO（部分更新） */
export class UpdateMonitorDto implements UpdateMonitorRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  targetPriceCent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'discountThreshold must be > 0' })
  @Max(1)
  discountThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minSampleSize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  frequencyMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryCode?: string;
}
