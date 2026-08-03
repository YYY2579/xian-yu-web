import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { createLogger } from '@xianyu/observability';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * 请求 ID 拦截器（API-001）
 * - 每个请求生成 request_id（沿用传入的 X-Request-Id 或新生成），写入响应头。
 * - 绑定带 request_id 的日志器到请求对象，供后续处理关联。
 */

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithContext = Request & {
  requestId?: string;
  logger?: ReturnType<typeof createLogger>;
};

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithContext>();
    const response = http.getResponse<Response>();

    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId = typeof incoming === 'string' && incoming.trim() !== '' ? incoming : undefined;
    request.requestId = requestId;

    if (requestId) {
      response.setHeader(REQUEST_ID_HEADER, requestId);
    }
    return next.handle();
  }
}
