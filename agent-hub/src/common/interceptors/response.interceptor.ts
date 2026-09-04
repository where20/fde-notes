import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    // SSE 端点（@Sse）返回的是流式 MessageEvent，不能被包装成 { code, data }，
    // 否则 SseStream 无法序列化。检测 @Sse 的元数据，命中则原样透传。
    const handler = context.getHandler();
    const isSse = Reflect.getMetadata('__sse__', handler);
    if (isSse) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // 204 等无内容的响应（handler 返回 void/undefined）不包装
        if (data === undefined) {
          return data;
        }
        return {
          code: 0,
          message: 'success',
          data,
        };
      }),
    );
  }
}
