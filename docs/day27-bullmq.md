# 📙 Day 27：BullMQ 任务队列

> 前置回顾：Day 26 用 Redis 做缓存。本篇解锁 Redis 的另一个核心用法——**任务队列**。耗时任务（发邮件、调 LLM、生成图片、处理视频）绝不能阻塞 HTTP 请求，必须丢进队列异步处理。这对 Agent 应用更是刚需。

---

## 27.1 为什么需要任务队列？

HTTP 请求有超时限制（通常 30~60 秒），但很多任务很慢：

| 耗时任务 | 耗时 | 同步处理的问题 |
| ---- | ---- | ---- |
| 发送邮件/短信 | 秒级 | 阻塞响应 |
| 调用 LLM 生成 | 十秒~分钟 | 请求超时 |
| 生成图片/视频 | 分钟级 | 连接被断 |
| 批量导入数据 | 分钟~小时 | 前端一直转圈 |

**队列的价值**：

```
HTTP 请求 → 创建任务（立即返回 jobId）→ 后台 Worker 慢慢处理 → 前端轮询/SSE 查进度
```

> 一句话：**把"同步等待"变成"异步执行"**。请求立即响应，慢活在后台消化。

---

## 27.2 BullMQ 是什么？

BullMQ 是基于 Redis 的 Node.js 任务队列库（Bull 的升级版），提供：

- ✅ 任务持久化（Redis 存储，进程重启不丢）
- ✅ 自动重试 + 指数退避
- ✅ 延迟任务、定时任务（Cron）
- ✅ 并发控制、速率限制
- ✅ 任务进度追踪
- ✅ 可视化管理面板

```bash
npm install @nestjs/bullmq bullmq
```

---

## 27.3 三个核心角色

| 角色 | 作用 | 类比 |
| ---- | ---- | ---- |
| **Queue（队列）** | 存放任务 | 传送带 |
| **Producer（生产者）** | 往队列塞任务 | 发货员 |
| **Consumer / Worker（消费者）** | 从队列取任务执行 | 处理员 |

---

## 27.4 注册队列

```ts
// app.module.ts
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: 'localhost', port: 6379 },
    }),
    BullModule.registerQueue({
      name: 'ai-generation',     // 队列名（自定义）
    }),
  ],
})
export class AppModule {}
```

> 队列通过 `name` 区分，一个应用可以有多个队列（email、ai-generation、export…）。

---

## 27.5 Producer：生产任务

```ts
// ai.controller.ts
@Controller('ai')
export class AiController {
  constructor(@InjectQueue('ai-generation') private queue: Queue) {}

  @Post('generate')
  async generate(@Body() dto: GenerateDto) {
    const job = await this.queue.add(
      'image',                                    // 任务名
      { prompt: dto.prompt },                     // 任务数据
      {
        attempts: 3,                              // 失败重试 3 次
        backoff: { type: 'exponential', delay: 2000 },  // 指数退避
        removeOnComplete: 100,                    // 保留最近 100 条完成记录
        removeOnFail: 500,
      },
    );

    // 立即返回 jobId，不等处理结果
    return { jobId: job.id, status: 'queued' };
  }
}
```

> **关键**：`queue.add()` 立即返回，HTTP 响应不等任务完成。前端拿到 `jobId` 后轮询或 SSE 查进度。

### 常用任务选项

| 选项 | 作用 |
| ---- | ---- |
| `attempts` | 失败重试次数 |
| `backoff` | 重试间隔策略（fixed / exponential） |
| `delay` | 延迟多少毫秒执行 |
| `priority` | 优先级（数字越小越优先） |
| `removeOnComplete` | 完成后保留条数 |
| `jobId` | 自定义 jobId（用于去重） |

---

## 27.6 Consumer / Worker：消费任务

```ts
// ai.processor.ts
@Processor('ai-generation')    // 绑定队列名
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  async process(job: Job<{ prompt: string }>): Promise<any> {
    this.logger.log(`处理任务 ${job.id}: ${job.data.prompt}`);

    // 更新进度（前端可查）
    await job.updateProgress(30);

    const result = await this.callLLM(job.data.prompt);

    await job.updateProgress(100);
    return result;    // 返回值存为任务的 returnvalue
  }
}
```

```ts
// ai.module.ts
@Module({
  imports: [BullModule.registerQueue({ name: 'ai-generation' })],
  providers: [AiProcessor],     // Worker 注册为 provider
})
export class AiModule {}
```

> Worker 是**独立消费者**，可以部署在多台机器上横向扩展——队列会自动分发任务。

---

## 27.7 查询任务状态与进度

```ts
@Get('job/:id')
async getJob(@Param('id') id: string) {
  const job = await this.queue.getJob(id);

  if (!job) throw new NotFoundException('任务不存在');

  return {
    id: job.id,
    state: await job.getState(),      // waiting/active/completed/failed/delayed
    progress: job.progress,           // 0~100
    result: job.returnvalue,          // process 返回值
    failedReason: job.failedReason,
  };
}
```

### 任务状态流转

```
waiting（等待）→ active（执行中）→ completed（完成）
                              ↘ failed（失败）→ 重试 → waiting
delayed（延迟中）→ waiting
```

---

## 27.8 延迟任务与定时任务

```ts
// 延迟任务：10 秒后执行
await queue.add('reminder', { userId: 1 }, { delay: 10000 });

// 定时任务：每天凌晨 2 点（Cron）
BullModule.registerQueue({
  name: 'report',
  repeat: { pattern: '0 2 * * *' },     // 标准 Cron 表达式
});
```

| 场景 | 用法 |
| ---- | ---- |
| 订单 30 分钟未支付自动关闭 | 延迟任务 `delay: 30*60*1000` |
| 每天生成报表 | Cron 定时任务 |
| 注册后 10 分钟发欢迎邮件 | 延迟任务 |

---

## 27.9 最佳实践

| 实践 | 说明 |
| ---- | ---- |
| **任务幂等** | 重试会重复执行，任务逻辑必须幂等（重复执行结果一致） |
| 设置重试 + 退避 | `attempts` + `backoff`，避免外部服务抖动导致失败 |
| 记录进度 | `job.updateProgress()`，前端可展示进度条 |
| 队列按业务拆分 | 快慢任务分离，避免慢任务堵住快任务 |
| 监控失败队列 | 失败任务要告警 + 人工介入 |
| 控制并发 | 避免瞬间打爆下游（如 LLM API 限流） |

---

## 27.10 自检清单

- [ ] 任务队列解决什么问题？为什么耗时任务不能同步处理？
- [ ] Queue / Producer / Consumer 三个角色分别做什么？
- [ ] `queue.add()` 后立即返回什么？前端怎么知道任务结果？
- [ ] `attempts` 和 `backoff` 的作用？为什么任务要幂等？
- [ ] 任务有哪些状态？如何查询进度？
- [ ] 延迟任务和 Cron 定时任务各用于什么场景？
- [ ] 为什么队列要按业务拆分？

---

## 🔗 上下篇

← [Day 26：Redis 缓存](/day26-redis) ｜ → [Day 28：WebSocket 实时通信](/day28-websocket)
