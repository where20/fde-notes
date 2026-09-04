import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  // bufferLogs + useLogger：用 pino 接管 NestJS 日志（结构化 + traceId）
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // 用 socket.io 适配器接管 WebSocket 网关（支持命名空间/房间）
  app.useWebSocketAdapter(new IoAdapter(app));

  // 全局校验管道：剥掉未声明的字段 + 自动类型转换
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 全局响应拦截器：统一 { code, message, data }
  app.useGlobalInterceptors(new ResponseInterceptor());
  // 全局异常过滤器：统一错误格式
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger 文档
  const config = new DocumentBuilder()
    .setTitle('agent-hub API')
    .setDescription('个人 AI 助手后端 —— 前端转 Agent 开发 35 天实战项目')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
  console.log(`🚀 agent-hub is running on: http://localhost:${process.env.PORT ?? 3000}`);
  console.log(`📚 API 文档: http://localhost:${process.env.PORT ?? 3000}/api-docs`);
}
bootstrap();
