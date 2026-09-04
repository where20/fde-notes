import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * 对 ioredis 客户端的轻封装，暴露常用的 get/set/del/ping。
 * 其他模块只要 `constructor(private redis: RedisService)` 就能用。
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
  ) {}

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<'OK'> {
    if (ttlSeconds !== undefined) {
      return this.client.set(key, value, 'EX', ttlSeconds);
    }
    return this.client.set(key, value);
  }

  del(key: string): Promise<number> {
    return this.client.del(key);
  }

  ping(): Promise<string> {
    return this.client.ping();
  }

  /** 向 channel 发布消息（配合 subscribe 做实时推送，如 AI 流式输出） */
  publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  /**
   * 创建专用于订阅的独立连接。
   * ioredis 一旦执行 subscribe，该连接就进入订阅模式、无法再执行普通命令，
   * 所以订阅方必须用 duplicate() 出来的新连接，用完后自行 quit()。
   */
  createSubscriber(): Redis {
    return this.client.duplicate();
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
