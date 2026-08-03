import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createLogger } from '@xianyu/observability';
import type { Request, Response } from 'express';

/**
 * 统一错误响应过滤器（API-001）
 * - 所有未捕获异常转换为统一结构 { code, message, requestId, path, timestamp }。
 * - HttpException 保留其状态码与业务消息；未知异常记 500 并隐藏内部细节。
 */

const logger = createLogger('api-http-exception');

function asMessage(response: unknown): string {
  if (typeof response === 'string') return response;
  if (response && typeof response === 'object') {
    const msg = (response as { message?: string | string[] }).message;
    if (Array.isArray(msg)) return msg.join('; ');
    if (typeof msg === 'string') return msg;
  }
  return 'Request failed';
}

export type ApiErrorBody = {
  code: string;
  message: string;
  requestId?: string;
  path: string;
  timestamp: string;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { requestId?: string }>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body: ApiErrorBody = {
      code: exception instanceof HttpException ? exception.name : 'INTERNAL_ERROR',
      message:
        exception instanceof HttpException
          ? asMessage(exception.getResponse())
          : 'Internal server error',
      requestId: request.requestId,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      logger.error('unhandled exception', {
        requestId: body.requestId,
        path: body.path,
        error: exception instanceof Error ? exception.message : String(exception),
      });
    }

    response.status(status).json(body);
  }
}
