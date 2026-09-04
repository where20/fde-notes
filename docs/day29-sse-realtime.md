# 📙 Day 29：SSE 与实时实战整合

> 前置回顾：Day 28 用 WebSocket 做双向实时通信。但**不是所有场景都需要双向**——LLM 流式输出、任务进度推送这类"服务端单向持续推送"，用 **SSE** 更轻量。本篇讲 SSE，并收官阶段七。

---

## 29.1 SSE 是什么？

**SSE = Server-Sent Events（服务端推送事件）**：基于 HTTP 的**单向**服务端推送技术。

```
客户端发起一次 HTTP 请求 → 服务端保持连接 → 持续推送数据片段 → 结束或一直保持
```

数据格式（`text/event-stream`）：

```
data: 第一段内容

data: 第二段内容

event: done
data: 任务完成

```

> 每次推送以两个换行 `\n\n` 结束，浏览器 `EventSource` 自动解析。

---

## 29.2 SSE vs WebSocket（选型关键）

| 维度 | **SSE** | **WebSocket** |
| ---- | ---- | ---- |
| 方向 | **单向**（服务端 → 客户端） | **双向** |
| 协议 | HTTP（无协议升级） | 独立 WS 协议 |
| 自动重连 | ✅ 浏览器 `EventSource` 原生支持 | ❌ 需自己实现 |
| 断线续传 | ✅ 支持 `Last-Event-ID` | ❌ |
| 数据格式 | 仅文本 | 文本 + 二进制 |
| 复杂度 | **低**（就是 HTTP） | 较高 |
| 浏览器兼容 | 除 IE 外全支持 | 全支持 |

### 选型口诀

| 场景 | 选什么 |
| ---- | ---- |
| LLM 流式输出（打字机效果） | ✅ **SSE**（OpenAI 就用它） |
| 任务进度 / 日志流推送 | ✅ **SSE** |
| 实时通知（单向） | ✅ **SSE** |
| 聊天 / 多人协作（双向） | ✅ **WebSocket** |
| 游戏 / 实时对战 | ✅ **WebSocket** |

> 一句话：**"服务端单向推"用 SSE，"双向对话"用 WebSocket**。SSE 更简单、自带重连，是流式场景的首选。

---

## 29.3 NestJS 实现 SSE

用 RxJS 的 `Observable` 返回流式响应（串 Day 8 Interceptor 用 RxJS）：

```ts
import { Observable, interval, map } from 'rxjs';

@Controller('stream')
export class StreamController {
  // SSE 端点：持续推送进度
  @Get('progress')
  @Sse()                    // @nestjs/common 提供
  progress(): Observable<MessageEvent> {
    return interval(1000).pipe(
      map((count) => ({
        data: { progress: count, message: `处理中 ${count}%` },
        type: 'progress',    // 自定义事件名
      })),
    );
  }
}
```

> SSE 的本质：**Controller 返回一个持续发射数据的 Observable**，Nest 自动以 `text/event-stream` 格式推送。

### 手动控制（@Res）

```ts
@Get('sse')
sse(@Res() res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const timer = setInterval(() => {
    res.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);
  }, 1000);

  // 客户端断开时清理
  res.on('close', () => {
    clearInterval(timer);
    res.end();
  });
}
```

> ⚠️ 忘记 `res.on('close')` 清理定时器 = **内存泄漏**，客户端断开后定时器仍在跑。

---

## 29.4 前端接收 SSE

### EventSource（原生，最简单）

```ts
const eventSource = new EventSource('/api/stream/progress');

// 接收默认事件
eventSource.onmessage = (event) => {
  console.log('收到:', JSON.parse(event.data));
};

// 接收自定义事件（type: 'progress'）
eventSource.addEventListener('progress', (event) => {
  updateProgress(JSON.parse(event.data).progress);
});

// 关闭连接
eventSource.close();
```

> `EventSource` 原生支持**自动重连**——断线后自动重新连接（这是相比 WebSocket 的一大优势）。

### fetch + ReadableStream（需要自定义 Header 时）

`EventSource` 不能自定义请求头（如带 `Authorization`），需要认证时用 fetch：

```ts
const response = await fetch('/api/stream/progress', {
  headers: { Authorization: `Bearer ${token}` },
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  console.log('收到:', chunk);
}
```

---

## 29.5 实战：LLM 流式输出（Agent 场景核心）

这是 SSE 最典型的应用——**AI 打字机效果**：

```ts
@Sse('chat')
chat(@Query('prompt') prompt: string): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    (async () => {
      const stream = await this.llmService.streamChat(prompt);

      for await (const chunk of stream) {
        subscriber.next({
          data: { content: chunk.text },
          type: 'message',
        });
      }

      // 推送完成事件
      subscriber.next({ data: '[DONE]', type: 'done' });
      subscriber.complete();
    })().catch((err) => subscriber.error(err));
  });
}
```

前端逐段渲染，实现打字机效果：

```ts
eventSource.addEventListener('message', (e) => {
  outputEl.textContent += JSON.parse(e.data).content;
});
eventSource.addEventListener('done', () => eventSource.close());
```

---

## 29.6 BullMQ × SSE：任务进度实时推送

串 Day 27 + Day 29——把队列任务的进度实时推给前端：

```ts
@Sse('job/:id')
jobProgress(@Param('id') id: string): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    const timer = setInterval(async () => {
      const job = await this.queue.getJob(id);
      if (!job) {
        subscriber.next({ data: { error: '任务不存在' }, type: 'error' });
        subscriber.complete();
        return;
      }

      const state = await job.getState();
      subscriber.next({ data: { state, progress: job.progress }, type: 'progress' });

      // 终态：结束推送
      if (['completed', 'failed'].includes(state)) {
        subscriber.next({
          data: { state, result: job.returnvalue, error: job.failedReason },
          type: 'done',
        });
        subscriber.complete();
      }
    }, 1000);

    // 关键：清理定时器，防内存泄漏
    return () => clearInterval(timer);
  });
}
```

> `Observable` 返回的清理函数会在客户端断开时自动执行——这是比 `setInterval` 更安全的写法。

---

## 29.7 阶段七完成总结

| Day | 主题 | 核心产出 |
| --- | ---- | ---- |
| Day 26 | Redis 缓存 | Redis 五大数据类型、Nest 整合、Cache-Aside、穿透/击穿/雪崩 |
| Day 27 | BullMQ 任务队列 | Queue/Producer/Consumer、重试退避、延迟定时、进度追踪 |
| Day 28 | WebSocket | Gateway、`@SubscribeMessage`、房间、鉴权、Redis Adapter |
| Day 29 | SSE 与实时实战 | SSE vs WebSocket、流式输出、LLM 打字机、队列进度推送 |

**一句话串联**：**Redis 加速读（Day 26）→ BullMQ 异步消化耗时任务（Day 27）→ WebSocket 双向实时（Day 28）→ SSE 单向流式推送（Day 29）**。

**下一阶段**：NestJS 底层原理（IoC/DI/Metadata/Dynamic Module/Scope，Day 30~33）——回到框架底层，把前七阶段的"为什么"彻底打通。

---

## 29.8 自检清单

- [ ] SSE 和 WebSocket 的核心区别？什么时候选 SSE？
- [ ] SSE 的数据格式？为什么用两个换行？
- [ ] `EventSource` 相比 WebSocket 客户端的优势？
- [ ] 需要自定义请求头（如认证）时怎么办？
- [ ] NestJS 里 SSE 靠什么实现？（Observable）
- [ ] 为什么必须处理客户端断开？（内存泄漏）
- [ ] LLM 流式输出为什么用 SSE 而非 WebSocket？

---

## 🔗 上下篇

← [Day 28：WebSocket 实时通信](/day28-websocket) ｜ → [Day 30：IoC / DI 底层原理](/day30-ioc-di-internals)
