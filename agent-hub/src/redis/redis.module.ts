import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT, REDIS_MODULE_OPTIONS } from './redis.constants';
import {
  RedisModuleAsyncOptions,
  RedisModuleOptions,
  RedisModuleOptionsFactory,
} from './redis.interfaces';
import { RedisService } from './redis.service';

/**
 * 自己手写的动态模块（Day 32 模式）。
 *
 * 静态模块只能 `imports: [RedisModule]`，无法传配置；
 * 动态模块则暴露 `register()` / `registerAsync()`，返回 DynamicModule，
 * 把"配置 → 客户端 → Service"这条 provider 链动态组装起来。
 *
 * 核心套路：
 * 1. `registerAsync` 里先用 createAsyncOptionsProvider 把 useFactory 包装成
 *    REDIS_MODULE_OPTIONS 这个 provider（inject 进来的 ConfigService 等先被解析）。
 * 2. createClientProvider 用 REDIS_MODULE_OPTIONS 去 new 一个 ioredis 客户端。
 * 3. RedisService 注入 REDIS_CLIENT，导出给全应用用。
 */
@Global() // 全局模块：任何模块不用重复 imports 就能注入 RedisService
@Module({})
export class RedisModule {
  /** 同步配置：RedisModule.register({ url: 'redis://...' }) */
  static register(options: RedisModuleOptions): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        { provide: REDIS_MODULE_OPTIONS, useValue: options },
        RedisModule.createClientProvider(),
        RedisService,
      ],
      exports: [RedisService, REDIS_CLIENT],
    };
  }

  /** 异步配置：RedisModule.registerAsync({ useFactory, inject }) */
  static registerAsync(asyncOptions: RedisModuleAsyncOptions): DynamicModule {
    return {
      module: RedisModule,
      imports: asyncOptions.imports ?? [], // useFactory 依赖的模块（如 ConfigModule）
      providers: [
        RedisModule.createAsyncOptionsProvider(asyncOptions),
        RedisModule.createClientProvider(),
        RedisService,
      ],
      exports: [RedisService, REDIS_CLIENT],
    };
  }

  /** 把"配置选项"变成 ioredis 客户端实例 */
  private static createClientProvider(): Provider {
    return {
      provide: REDIS_CLIENT,
      useFactory: (options: RedisModuleOptions): Redis => {
        const client = options.url
          ? new Redis(options.url, { maxRetriesPerRequest: null })
          : new Redis({
              host: options.host ?? 'localhost',
              port: options.port ?? 6379,
              password: options.password,
              db: options.db,
              maxRetriesPerRequest: null,
            });
        return client;
      },
      inject: [REDIS_MODULE_OPTIONS],
    };
  }

  /** 把 useFactory / useClass / useExisting 归一成 REDIS_MODULE_OPTIONS provider */
  private static createAsyncOptionsProvider(
    asyncOptions: RedisModuleAsyncOptions,
  ): Provider {
    if (asyncOptions.useFactory) {
      return {
        provide: REDIS_MODULE_OPTIONS,
        useFactory: asyncOptions.useFactory,
        inject: asyncOptions.inject ?? [],
      };
    }

    const useClass = asyncOptions.useClass ?? asyncOptions.useExisting;
    if (useClass) {
      return {
        provide: REDIS_MODULE_OPTIONS,
        useFactory: async (factory: RedisModuleOptionsFactory) =>
          factory.createRedisOptions(),
        inject: [useClass],
      };
    }

    throw new Error(
      'RedisModule.registerAsync 需要 useFactory / useClass / useExisting 之一',
    );
  }
}
