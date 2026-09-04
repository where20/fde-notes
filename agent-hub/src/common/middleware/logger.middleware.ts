import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    // traceId：优先取上游传入的，否则生成一个，贯穿本次请求
    const traceId = (req.headers['x-trace-id'] as string) || randomUUID();
    (req as any).traceId = traceId;
    res.setHeader('X-Trace-Id', traceId);

    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;
      this.logger.log(`[${traceId}] ${method} ${originalUrl} → ${statusCode} ${duration}ms`);
    });

    next();
  }
}
