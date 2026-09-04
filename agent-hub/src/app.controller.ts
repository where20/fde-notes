import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    // 跨模块注入 RedisService：证明 RedisModule 的动态模块配置 + @Global 导出生效
    private readonly redisService: RedisService,
  ) {}

  // 根路径是欢迎页，和 /health 一样无需认证
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  // 阶段八验收：动态模块（registerAsync + useFactory + inject）注入的配置真正建立了连接
  @Public()
  @Get('redis/demo')
  async redisDemo(): Promise<{
    ping: string;
    key: string;
    value: string | null;
  }> {
    const key = 'dynamic-module-demo';
    await this.redisService.set(key, 'hello-from-redis-module', 60);
    const value = await this.redisService.get(key);

    return { ping: await this.redisService.ping(), key, value };
  }
}
