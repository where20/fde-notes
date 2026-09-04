import { ModuleMetadata, Type } from '@nestjs/common';

/** 同步配置：直接传 URL，或传 host/port 等字段 */
export interface RedisModuleOptions {
  /** redis://user:pass@host:port/db 形式，优先级高于 host/port */
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

/** 实现这个接口的类可以作为 useClass/useExisting 的配置来源 */
export interface RedisModuleOptionsFactory {
  createRedisOptions(): Promise<RedisModuleOptions> | RedisModuleOptions;
}

/**
 * 异步配置：让模块能"接收外部配置"（这正是动态模块的核心价值）。
 * 支持三种方式（和 NestJS 官方 ConfigurableModuleBuilder 同款模式）：
 * - useFactory + inject：最常用，从 ConfigService 等拿配置
 * - useClass：实例化一个实现了 RedisModuleOptionsFactory 的类
 * - useExisting：复用已存在的 provider
 */
export interface RedisModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory?: (
    ...args: any[]
  ) => Promise<RedisModuleOptions> | RedisModuleOptions;
  inject?: any[];
  useClass?: Type<RedisModuleOptionsFactory>;
  useExisting?: Type<RedisModuleOptionsFactory>;
}
