import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, rawMessage } = this.normalize(exception);

    // class-validator 的错误 message 是数组，取第一条即可
    const message =
      typeof rawMessage === 'object' && rawMessage !== null
        ? (rawMessage as any).message ?? (rawMessage as any).error ?? '请求失败'
        : (rawMessage as string);

    const traceId = (req as any).traceId ?? '-';
    this.logger.error(
      `[${traceId}] ${req.method} ${req.url} → ${status}: ${JSON.stringify(message)}`,
    );

    res.status(status).json({
      code: status,
      message: Array.isArray(message) ? message[0] : message,
      data: null,
    });
  }

  /** 把各类异常归一成 { status, rawMessage }，Prisma 错误单独映射为友好状态码 */
  private normalize(exception: unknown): {
    status: number;
    rawMessage: string | object;
  } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const target = exception.meta?.target;
          const field = Array.isArray(target)
            ? target.join(', ')
            : String(target ?? '字段');
          return {
            status: HttpStatus.CONFLICT,
            rawMessage: `唯一约束冲突：${field} 已存在`,
          };
        }
        case 'P2025':
          return { status: HttpStatus.NOT_FOUND, rawMessage: '记录不存在' };
        default:
          return {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            rawMessage: '数据库操作失败',
          };
      }
    }

    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        rawMessage: exception.getResponse(),
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      rawMessage: 'Internal server error',
    };
  }
}
