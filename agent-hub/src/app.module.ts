import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { createKeyv } from '@keyv/redis';
import * as Joi from 'joi';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { ChatModule } from './chat/chat.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // 全局配置 + Joi 校验：缺必填项时启动即失败，并明确报缺哪个
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('7d'),
        PORT: Joi.number().default(3000),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
      }),
    }),
    // pino 结构化日志（自动记录 HTTP 请求 + traceId）
    LoggerModule.forRoot(),
    // Redis 缓存（cache-manager v6 + keyv 适配器），全局可用
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        stores: [
          createKeyv(
            `redis://${config.get('REDIS_HOST', 'localhost')}:${config.get('REDIS_PORT', 6379)}`,
          ),
        ],
        ttl: 60_000, // 默认 60 秒过期
      }),
    }),
    // BullMQ 根配置（Redis 作为队列存储），全局可用
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get('REDIS_PORT', 6379),
        },
      }),
    }),
    // 自己封装的 Redis 动态模块（阶段八）：配置来自 ConfigService
    // —— 这就是"动态模块"的核心：useFactory + inject 让模块接收外部配置
    RedisModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        host: config.get('REDIS_HOST', 'localhost'),
        port: config.get('REDIS_PORT', 6379),
      }),
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    AiModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 全局守卫：先认证（JwtAuthGuard），再鉴权（RolesGuard）
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
