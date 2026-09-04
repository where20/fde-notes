import {
  Body,
  Controller,
  MessageEvent,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Redis } from 'ioredis';
import { Observable } from 'rxjs';
import { Public } from '../auth/decorators/public.decorator';
import { RedisService } from '../redis/redis.service';
import { AiService, JobInfo, StreamEvent, streamChannel } from './ai.service';
import { GenerateDto } from './dto/generate.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Post('generate')
  @ApiOperation({ summary: '提交 AI 生成任务（立即返回 jobId，不阻塞）' })
  generate(@Body() dto: GenerateDto): Promise<{ jobId: string }> {
    return this.aiService.generate(dto.prompt);
  }

  @Public()
  @Post('rag')
  @ApiOperation({ summary: '提交 RAG 检索增强问答任务（先检索知识库再回答）' })
  rag(@Body() dto: GenerateDto): Promise<{ jobId: string }> {
    return this.aiService.rag(dto.prompt);
  }

  @Public()
  @Sse('stream/:jobId')
  @ApiOperation({ summary: 'SSE 流式订阅：实时接收模型逐字输出' })
  stream(@Param('jobId') jobId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const channel = streamChannel(jobId);
      let sub: Redis | null = null;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        // 订阅用的是 duplicate 出来的独立连接，必须单独关掉，否则连接泄漏
        sub?.quit().catch(() => undefined);
        subscriber.complete();
      };

      /**
       * Redis pub/sub 不持久化：订阅晚于发布，消息就直接丢了。
       * 所以先查一次任务状态 —— 已结束的任务直接补发结果，
       * 只有「进行中」才需要订阅 channel 实时等 chunk。
       */
      this.aiService.getJob(jobId).then((info: JobInfo | null) => {
        if (closed) return;

        if (!info) {
          subscriber.next({
            data: JSON.stringify({ type: 'not_found' } satisfies StreamEvent),
          });
          return close();
        }

        if (info.state === 'completed') {
          const text = (info.result as { text?: string } | undefined)?.text ?? '';
          subscriber.next({
            data: JSON.stringify({ type: 'done', text } satisfies StreamEvent),
          });
          return close();
        }

        if (info.state === 'failed') {
          subscriber.next({
            data: JSON.stringify({
              type: 'error',
              message: '任务处理失败',
            } satisfies StreamEvent),
          });
          return close();
        }

        // 进行中：订阅 channel，把 Worker 发布的每个事件原样转发给前端
        sub = this.redis.createSubscriber();
        sub.subscribe(channel, (err) => {
          if (err && !closed) {
            subscriber.next({
              data: JSON.stringify({
                type: 'error',
                message: '订阅频道失败',
              } satisfies StreamEvent),
            });
            close();
          }
        });

        sub.on('message', (_channel, message) => {
          if (closed) return;
          subscriber.next({ data: message });

          // 终态事件推完就关闭流，避免连接一直挂着
          const event = JSON.parse(message) as StreamEvent;
          if (event.type === 'done' || event.type === 'error') close();
        });
      });

      // 客户端断开时清理
      return () => close();
    });
  }
}
