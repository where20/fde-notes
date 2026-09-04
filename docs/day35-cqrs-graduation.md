# 📙 Day 35：CQRS 与 35 天毕业 🎓

> 前置回顾：Day 34 讲了微服务架构。本篇是 35 天路线的**最后一篇**——讲 CQRS（了解即可），然后把九大阶段完整回顾，给出毕业自检清单。坚持到这里，你已经具备完整的后端开发能力，可以开始做 Agent 应用了。

---

## 35.1 CQRS 是什么？

**CQRS = Command Query Responsibility Segregation（命令查询职责分离）**。

核心思想一句话：**"读"和"写"用不同的模型。**

```
传统 CRUD：  User 模型 ── 既用于读，也用于写
CQRS：      写模型（Command）  →  处理业务变更
            读模型（Query）    →  优化查询展示
```

### 为什么分离？

| 维度 | 写（Command） | 读（Query） |
| ---- | ---- | ---- |
| 频率 | 低 | **高**（通常 10:1 以上） |
| 关注点 | 业务规则、一致性 | 查询性能、展示结构 |
| 模型 | 领域模型（复杂） | 视图模型（扁平） |
| 优化方向 | 事务、校验 | 缓存、索引、反范式 |

> 读写流量差异巨大，硬塞进一个模型，两边都难优化。CQRS 让各自独立演进。

---

## 35.2 CQRS 在 NestJS

```bash
npm install @nestjs/cqrs
```

```ts
// Command（写）：创建用户
export class CreateUserCommand {
  constructor(public readonly dto: CreateUserDto) {}
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  async execute(command: CreateUserCommand) {
    const user = await this.repo.create(command.dto);
    return user;
  }
}
```

```ts
// Query（读）：查询用户列表
export class GetUsersQuery {
  constructor(public readonly page: number) {}
}

@QueryHandler(GetUsersQuery)
export class GetUsersHandler implements IQueryHandler<GetUsersQuery> {
  async execute(query: GetUsersQuery) {
    return this.readRepo.findPage(query.page);   // 走优化过的读模型/缓存
  }
}
```

```ts
// Controller：分别派发
@Post() create(@Body() dto) {
  return this.commandBus.execute(new CreateUserCommand(dto));
}
@Get() findAll(@Query('page') page) {
  return this.queryBus.execute(new GetUsersQuery(page));
}
```

| 组件 | 作用 |
| ---- | ---- |
| `CommandBus` | 派发写命令 |
| `QueryBus` | 派发读查询 |
| `EventBus` | 领域事件（配合 Event Sourcing） |
| `@CommandHandler` | 写处理器 |
| `@QueryHandler` | 读处理器 |

---

## 35.3 Event Sourcing（了解）

CQRS 的进阶搭档：**不存"当前状态"，而存"所有事件"**。

```
传统：   users 表 → { id: 1, balance: 100 }
事件源： 事件流 → [充值100] [消费30] [充值50] → 回放得到 balance=120
```

| 优点 | 缺点 |
| ---- | ---- |
| 完整审计轨迹 | 复杂度高 |
| 可回放历史状态 | 查询需额外建读模型 |
| 天然配合 CQRS | 团队学习成本 |

> ⚠️ 路线图定位：**了解即可**。绝大多数项目用不上，别为了用而用。

---

## 35.4 九阶段完整回顾

| 阶段 | 主题 | Day | 核心能力 |
| ---- | ---- | ---- | ---- |
| 一 | Module / DI / IoC | 1~2 | 模块化组织代码、依赖注入 |
| 二 | 请求生命周期 | 3~9 | Middleware/Guard/Pipe/Interceptor/Filter |
| 三 | REST API / DTO / Swagger | 10~12 | 规范接口、参数校验、自动文档 |
| 四 | PostgreSQL / Prisma | 13~17 | 数据建模、ORM、事务、高级查询 |
| 五 | JWT / Passport / RBAC | 18~21 | 认证与授权、完整登录体系 |
| 六 | 工程化 / Testing / Docker | 22~25 | 配置、日志、测试、容器化、CI/CD |
| 七 | Redis / BullMQ / SSE / WebSocket | 26~29 | 缓存、异步队列、实时通信 |
| 八 | 底层原理 | 30~33 | IoC 容器、作用域、动态模块、元编程 |
| 九 | 微服务 / MQ / CQRS | 34~35 | 架构视野（了解） |

---

## 35.5 35 天能力地图

```
HTTP 请求进来
    ↓
Middleware（日志/traceId）      ← Day 5
    ↓
Guard（JwtAuthGuard 认证）       ← Day 6/19
    ↓
Guard（RolesGuard 授权）         ← Day 20
    ↓
Interceptor（统一响应/耗时）      ← Day 8
    ↓
Pipe（DTO 校验转换）             ← Day 7/11
    ↓
Controller → Service → Repository ← Day 1/15
    ↓
Prisma → PostgreSQL              ← Day 14/16
    ↓
缓存层 Redis                     ← Day 26
    ↓
队列 BullMQ（耗时任务）           ← Day 27
    ↓
SSE / WebSocket（实时推送）       ← Day 28/29
    ↓
异常 → Exception Filter          ← Day 9
    ↓
日志（pino + traceId）           ← Day 22
    ↓
Docker 部署 + CI/CD              ← Day 24/25
```

> 任意一个环节，你都能说出"它做什么、为什么放在这个位置、不用它会怎样"——这就是毕业标准。

---

## 35.6 🎓 毕业自检清单

### 基础架构（阶段一）
- [ ] 为什么需要 Module？Provider 是什么？为什么不用 `new`？
- [ ] IoC 和 DI 的区别？`@Injectable()` 做了什么？
- [ ] Decorator 和 Metadata 的关系？Metadata 会自己执行吗？

### 请求生命周期（阶段二）
- [ ] 背出 M-G-I-P-C-I-E 顺序？
- [ ] Middleware / Guard / Pipe / Interceptor / Filter 各自职责与区别？
- [ ] Guard 为什么能做权限而 Middleware 不行？
- [ ] `ExecutionContext` 能拿到什么？`Reflector` 三个方法区别？

### REST 与文档（阶段三）
- [ ] REST 资源导向 vs 动作导向？PUT vs PATCH？
- [ ] 401 和 403 的区别？
- [ ] DTO 为什么必须用 class？嵌套校验需要哪两个装饰器？
- [ ] Swagger 由什么驱动？

### 数据持久化（阶段四）
- [ ] 三大范式？金额用什么类型？
- [ ] Prisma 三件套？`migrate dev` vs `deploy`？
- [ ] 三种关系怎么表达？事务解决什么？
- [ ] 深分页用什么？软删除怎么实现？

### 认证授权（阶段五）
- [ ] 认证 vs 授权？Session vs JWT？
- [ ] JWT 三段式？哪段防篡改？为什么 payload 不能放密码？
- [ ] LocalStrategy 和 JwtStrategy 的 validate 区别？
- [ ] 全局守卫为什么用 `APP_GUARD`？`@Public` 怎么放行？

### 工程化（阶段六）
- [ ] 配置为什么不能硬编码？Joi 校验在何时？
- [ ] 测试金字塔？怎么 mock Repository？
- [ ] Docker 多阶段构建为什么瘦身？
- [ ] CI 和 CD 分别是什么？

### 缓存队列实时（阶段七）
- [ ] Redis 五大数据类型及场景？
- [ ] 缓存穿透/击穿/雪崩的解法？
- [ ] 任务队列三角色？为什么任务要幂等？
- [ ] WebSocket 和 SSE 怎么选型？

### 底层原理（阶段八）
- [ ] `design:paramtypes` 是谁生成的？记录什么？
- [ ] 三种作用域？单例为什么不能存请求状态？
- [ ] 动态模块 `forRoot` 和 `register` 区别？Async 三件套？
- [ ] `createParamDecorator` 怎么用？元编程闭环是什么？

---

## 35.7 下一步：通往 Agent 开发

这个 35 天的目标从来不是"成为 NestJS 专家"，而是**建立完整的后端能力，为 Agent 应用打基础**。

现在你已经具备了做 Agent 应用的全部后端能力：

| Agent 应用需要什么 | 你已掌握 |
| ---- | ---- |
| 会话管理、用户体系 | JWT + RBAC（Day 18~21） |
| 对话持久化 | Prisma + PostgreSQL（Day 13~17） |
| **流式输出**（打字机） | SSE（Day 29） |
| LLM 异步调用（慢、超时） | BullMQ 队列（Day 27） |
| 上下文缓存、限流 | Redis（Day 26） |
| 多轮实时交互 | WebSocket（Day 28） |
| 工具调用（Tool/Function Call） | 模块化 Service（Day 1） |
| 部署上线 | Docker + CI/CD（Day 24~25） |

> **边界意识**（总览篇强调过）：NestJS 是通往 Agent 的台阶，不是终点。接下来把精力投向**大模型应用本身**——RAG、Agent 编排、工具生态、Prompt 工程。后端能力已经是你的基础设施，不再是瓶颈。

---

## 🎉 结语

35 天，从 `Hello World` 到一套完整可上线的后端体系。

**记住总览篇那句话**：35 天不能变成 35 天看视频。如果你全程跟着一个项目，从 CRUD 累加到 JWT、Redis、队列、实时推送——那你现在手上的，是一个真正能跑的后端系统。

**接下来才是正题**：用它去承载你的 Agent 应用。

---

## 🔗 上下篇

← [Day 34：微服务与 MQ](/day34-microservices-mq) ｜ → [总览 · 35 天路线](/)
