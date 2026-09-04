# 📙 Day 34：微服务与 MQ

> 前置回顾：前八阶段都是**单体架构**（一个 Nest 应用搞定全部）。本篇进入阶段九——**微服务**。按路线图，这阶段是「了解即可」，重点是建立概念认知，知道什么时候该拆、拆了怎么通信。

---

## 34.1 单体 vs 微服务

| 维度 | **单体（Monolith）** | **微服务（Microservices）** |
| ---- | ---- | ---- |
| 部署 | 一个进程 | 多个独立服务 |
| 技术栈 | 统一 | 各服务可不同 |
| 扩展 | 整体扩容 | 按需扩单个服务 |
| 复杂度 | **低** | 高（网络、分布式事务） |
| 适用 | 中小项目、早期 | 大型系统、多团队 |

```
单体：  [Web + User + Order + Payment] 一个进程
微服务：[Web] → [User服务] [Order服务] [Payment服务]  各自独立部署
```

> ⚠️ **重要认知**：微服务不是"更先进的架构"，而是"更复杂的架构"。**单体能搞定的，别上微服务**。绝大多数项目（包括多数 Agent 应用）单体就够了。

### 什么时候才该拆？

- 团队规模大，多人协作频繁冲突
- 某模块压力极大，需要独立扩容（如 AI 推理服务）
- 某模块需要不同技术栈（如 Python 的 ML 服务）
- 发布频率差异大（某模块天天发，其他月更）

---

## 34.2 服务间怎么通信？

| 方式 | 协议 | 特点 | 场景 |
| ---- | ---- | ---- | ---- |
| **HTTP / REST** | 同步 | 简单、直观 | 服务间调用（最常用） |
| **gRPC** | 同步 | 高性能、强类型 | 内部高频调用 |
| **MQ 消息队列** | **异步** | 解耦、削峰、可靠 | 事件通知、异步任务 |

> 同步 = 调用方等结果；异步 = 发完就走，不等。

---

## 34.3 NestJS 微服务

Nest 内置微服务支持，用 `@nestjs/microservices`：

```bash
npm install @nestjs/microservices
```

### 创建微服务（不是 HTTP 服务）

```ts
// main.ts —— 微服务入口
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.TCP,      // 传输层
      options: { host: 'localhost', port: 3001 },
    },
  );
  await app.listen();
}
bootstrap();
```

### 传输层（Transport）

| 传输层 | 特点 | 场景 |
| ---- | ---- | ---- |
| `Transport.TCP` | 默认，最简单 | 内部服务、调试 |
| `Transport.REDIS` | 基于 Redis 发布订阅 | 轻量、已有 Redis |
| `Transport.KAFKA` | 高吞吐、持久化 | 大规模事件流 |
| `Transport.RMQ` | RabbitMQ，功能完整 | 企业级消息 |
| `Transport.GRPC` | 高性能 RPC | 高频内部调用 |
| `Transport.NATS` | 轻量云原生 | K8s 环境 |

---

## 34.4 两种消息模式

### ① @MessagePattern（请求-响应）

类似 HTTP 的"问-答"：发送方**等结果**。

```ts
// 服务端（微服务）
@Controller()
export class MathController {
  @MessagePattern({ cmd: 'sum' })
  sum(data: number[]): number {
    return data.reduce((a, b) => a + b);
  }
}
```

```ts
// 客户端（另一个服务）
constructor(
  @Inject('MATH_SERVICE') private client: ClientProxy,
) {}

async calculate() {
  // send() 返回 Observable，等结果
  const result = await firstValueFrom(
    this.client.send({ cmd: 'sum' }, [1, 2, 3]),
  );
  return result;   // 6
}
```

### ② @EventPattern（发布-订阅，发完就走）

类似"广播通知"：发送方**不等结果**。

```ts
// 服务端
@Controller()
export class NotificationController {
  @EventPattern('user_created')
  handleUserCreated(data: { userId: number }) {
    console.log('新用户注册，发欢迎邮件:', data.userId);
  }
}
```

```ts
// 客户端：emit() 发出事件，不等返回
this.client.emit('user_created', { userId: 1 });
```

### 对比

| 模式 | 方法 | 等结果 | 场景 |
| ---- | ---- | ---- | ---- |
| `@MessagePattern` | `client.send()` | ✅ 等（Observable） | 需要返回值（查数据、计算） |
| `@EventPattern` | `client.emit()` | ❌ 不等 | 通知、广播（发邮件、记日志） |

---

## 34.5 MQ 消息队列（概念层）

**MQ = Message Queue**，微服务异步通信的核心组件。

```
生产者 → [  MQ 队列  ] → 消费者
         （缓冲、削峰）
```

| 概念 | 说明 |
| ---- | ---- |
| **Producer** | 发消息的一方 |
| **Consumer** | 消费消息的一方 |
| **Queue / Topic** | 消息存放的通道 |
| **Broker** | 消息中间件服务（RabbitMQ / Kafka / Redis） |
| **ACK** | 消费确认（处理完告诉 MQ，避免丢失） |

### MQ 四大价值

| 价值 | 说明 |
| ---- | ---- |
| **解耦** | 生产者不关心谁消费、有几个消费者 |
| **削峰** | 流量高峰时队列缓冲，消费者按能力处理 |
| **异步** | 主流程不等慢操作 |
| **可靠** | 消息持久化 + ACK + 重试 |

> 串 Day 27：BullMQ 本质上就是一个**基于 Redis 的轻量级 MQ**（Job = Message）。学队列时建立的概念可直接迁移。

### 主流 MQ 对比

| MQ | 特点 | 适用 |
| ---- | ---- | ---- |
| **Redis / BullMQ** | 轻量，够用 | 中小项目、任务队列 |
| **RabbitMQ** | 功能完整、路由灵活 | 企业级业务消息 |
| **Kafka** | 超高吞吐、持久化、可回放 | 日志流、大数据 |
| **NATS** | 极轻量、云原生 | K8s 微服务 |

---

## 34.6 微服务的代价（必须知道）

拆分的收益伴随**显著成本**：

| 代价 | 说明 |
| ---- | ---- |
| **分布式事务** | 跨服务数据一致性难（需 Saga / 最终一致） |
| 网络不可靠 | 调用可能超时、失败，需重试 + 熔断 |
| 调试困难 | 一个请求跨多服务，需链路追踪（traceId，串 Day 22） |
| 运维复杂 | 多个服务部署、监控、扩容 |
| 数据冗余 | 服务各自有库，需同步 |

> **忠告**：先做模块化良好的单体（Module 边界清晰），等业务真的需要时再拆。**过早微服务是灾难**。

---

## 34.7 自检清单

- [ ] 单体和微服务的取舍？什么时候该拆？
- [ ] 服务间三种通信方式？同步 vs 异步？
- [ ] `@MessagePattern` 和 `@EventPattern` 的区别？`send` vs `emit`？
- [ ] MQ 的五大概念？四大价值？
- [ ] BullMQ 和 RabbitMQ/Kafka 的关系？
- [ ] 微服务带来哪些代价？

---

## 🔗 上下篇

← [Day 33：装饰器与元编程](/day33-decorator-metaprogramming) ｜ → [Day 35：CQRS 与 35 天毕业](/day35-cqrs-graduation)
