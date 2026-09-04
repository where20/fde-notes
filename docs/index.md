# 📘 NestJS 学习笔记（前端转 Agent 开发 · 35 天路线）

> **整理来源**：微信公众号「楠熠之」《前端转 Agent 开发》NestJS 系列连载（总览篇 + Day 1 ~ Day 4）；**Day 5 起为按 35 天路线自主扩展的内容**，与原系列无对应关系。
> **作者目标**：35 天建立完整后端开发能力，为后续 Agent 应用开发打基础。
> **本笔记状态**：🎉 **35 天路线已全部完结**（总览 + Day 1~35，九大阶段全覆盖）。
> **阅读方式**：概念优先，不背 API。每篇都强调"能回答问题才算学会"。
> **🚀 想动手**：看 → [实战施工图](/hands-on-guide)（从零跑通一个能上线的 NestJS 后端，每步有验收）。
> **✅ 实战已完成**：配套项目 `agent-hub` 按施工图 **9 个阶段 0→上线全部跑通**（认证 / RBAC / 落库 / 缓存 / 队列 / SSE / WebSocket / 动态模块 / 容器化部署），代码 + README 见工作区 `agent-hub/`。

---

## 🗺️ 整体学习路线（总览篇）

**核心定位**：NestJS 不是替代 Node.js / Express，而是在 Web Framework 之上再提供**一层应用架构**，解决"大型 Node.js 后端项目代码应该怎么组织"。

```
JavaScript / TypeScript
        ↓
      Node.js          （HTTP / Event Loop / Stream / Process）
        ↓
   Express / Fastify
        ↓
      NestJS           （Module / Controller / Provider / DI / Guard / Pipe / Interceptor / Filter / Decorator）
        ↓
   完整后端应用
```

### 35 天 · 九阶段规划

| 阶段     | 学习内容                                              | 天数     | 重要度       |
| ------ | ------------------------------------------------- | ------ | --------- |
| 一      | Module / Controller / Provider / DI / IoC         | 4      | ★★★★★     |
| 二      | 请求生命周期（Middleware/Guard/Pipe/Interceptor/Filter）  | 5      | ★★★★★     |
| 三      | REST API / DTO / Validation / Swagger             | 3      | ★★★★      |
| 四      | PostgreSQL / Prisma                               | 5      | ★★★★★     |
| 五      | JWT / Passport / RBAC                             | 4      | ★★★★★     |
| 六      | 工程化 / Testing / Docker                            | 4      | ★★★★      |
| 七      | Redis / BullMQ / SSE / WebSocket                  | 4      | ★★★★      |
| 八      | NestJS 底层原理（IoC/DI/Metadata/Dynamic Module/Scope） | 4      | ★★★★★     |
| 九      | 微服务 / MQ / CQRS                                   | 2      | ★★☆（了解即可） |
| **总计** |                                                   | **35** |           |

> **边界意识**：NestJS 不是最终目标，而是通往 Agent 的台阶。GraphQL、复杂 CQRS、Kafka 深入、gRPC 深入、大型微服务治理——第一轮先放一放，用到再回钻。
> **学习方式**：35 天不能变成 35 天看视频。全程维护一个项目，从 Hello World 逐步累加 CRUD → PostgreSQL → JWT → RBAC → Redis → BullMQ → SSE → Docker。

---

## 📊 速查表

### A. 请求生命周期记忆口诀

**M-G-I-P-C-I-E** → Middleware · Guard · Interceptor(前) · Pipe · Controller · Interceptor(后) · Exception Filter

### B. IoC vs DI

- **IoC**：谁管理对象？（容器）
- **DI**：对象怎么给到使用者？（注入）

### C. 四组必熟练装饰器

结构 `@Module @Controller @Injectable` ｜ 路由 `@Get @Post @Patch @Delete` ｜ 参数 `@Body @Param @Query` ｜ 生命周期 `@UseGuards @UsePipes @UseInterceptors @UseFilters`

### D. providers / exports / imports

我有什么 / 我愿给别人什么 / 我要用谁的能力

---

## ✅ 核心自检问题清单（毕业标准参考）

- [ ] 为什么需要 Module？Provider 是什么？为什么 Service 不用 `new`？
- [ ] IoC 和 DI 是什么？`@Injectable()` 做了什么？
- [ ] Decorator 和 Metadata 是什么关系？Metadata 会自己执行逻辑吗？
- [ ] NestJS 请求生命周期是什么？Middleware/Guard/Pipe/Interceptor/Filter 区别？
- [ ] ExecutionContext 是什么？Metadata 和 Reflector 怎么协作？
- [ ] Singleton / Request / Transient 三种 Scope 区别？
- [ ] NestJS 与 Express / Fastify 是什么关系？

---

## 📚 阶段二完成：请求生命周期五件套

`M-G-I-P-C-I-E` 五个组件逐个深入完毕：

| Day   | 组件                | 核心关键词                                         |
| ----- | ----------------- | --------------------------------------------- |
| Day 5 | Middleware        | 通用预处理、`configure` + `MiddlewareConsumer`、不关心 Handler |
| Day 6 | Guard             | `CanActivate`、`ExecutionContext`、`Reflector`、RBAC |
| Day 7 | Pipe              | 转换 + 校验、`ValidationPipe`、`whitelist`           |
| Day 8 | Interceptor       | RxJS 包裹、`tap`/`map`/`catchError`、统一响应与缓存        |
| Day 9 | Exception Filter  | 统一异常格式、`ArgumentsHost`、`@Catch()`              |

> 记忆口诀：**Middleware 管"进来"，Guard 管"能不能进"，Interceptor 管"进出都管"，Filter 管"出错了怎么办"**。

---

## 📚 阶段三完成：REST API / DTO / Swagger

| Day     | 主题              | 核心产出                                                                          |
| ------- | --------------- | ----------------------------------------------------------------------------- |
| Day 10  | REST API 设计规范   | 资源导向 vs 动作导向、HTTP 方法语义与幂等性、状态码选择、URL 命名、查询参数、版本控制、六个反模式                      |
| Day 11  | DTO 进阶          | DTO 本质与三作用、入参/出参分离（响应脱敏）、嵌套对象与数组校验、`@Type`/`@Transform`/`@Exclude`、四个复用工具、自定义校验装饰器 |
| Day 12  | Swagger 文档      | `DocumentBuilder` + `SwaggerModule`、装饰器体系、DTO 与文档联动、枚举处理、生产环境三种保护方案、常见坑       |

> **一句话串联**：用 DTO 定义契约（Day 11）→ 按 REST 规范暴露接口（Day 10）→ 自动生成文档（Day 12）。

---

## 📚 阶段四完成：PostgreSQL / Prisma / Repository 分层

| Day     | 主题            | 核心产出                                                                     |
| ------- | ------------- | ------------------------------------------------------------------------ |
| Day 13  | PostgreSQL 基础 | 关系型 vs NoSQL、核心概念、常用数据类型、三大范式、Docker 启动、CRUD SQL、JOIN                       |
| Day 14  | Prisma 入门     | 三件套（Schema/Client/Migrate）、schema 语法、`migrate dev`、基本 CRUD、Prisma Studio        |
| Day 15  | NestJS 整合     | `PrismaService`（OnModuleInit/Destroy）、`@Global` 模块、Repository 分层（C→S→R 职责划分）     |
| Day 16  | 关系与事务        | 一对多/多对多/一对一、嵌套读写、`onDelete: Cascade`、`$transaction` 事务                        |
| Day 17  | 高级查询         | 分页（skip/take vs 游标）、where 操作符、排序、聚合、索引优化、软删除、完整 CRUD 实战                        |

> **一句话串联**：PostgreSQL 存数据（Day 13）→ Prisma 操作数据（Day 14）→ NestJS 分层整合（Day 15）→ 关系与事务（Day 16）→ 高级查询实战（Day 17）。

---

## 📚 阶段五完成：JWT / Passport / RBAC

| Day | 主题 | 核心产出 |
| --- | ---- | ---- |
| Day 18 | JWT 认证原理 | 认证vs授权、无状态、三段式、签名、双 token、安全边界 |
| Day 19 | Passport 策略 | Strategy 抽象、Local/Jwt 策略、AuthGuard 绑定、AuthModule |
| Day 20 | RBAC 权限 | Role vs Permission、@Roles + RolesGuard、@Public、全局守卫 |
| Day 21 | 认证实战整合 | 注册/登录/刷新全流程、bcrypt、@CurrentUser、完整串联 |

> **一句话串联**：JWT 确认"你是谁"（Day 18）→ Passport 优雅落地认证（Day 19）→ RBAC 控制"你能干什么"（Day 20）→ 全部串成完整认证体系（Day 21）。

---

## 📚 阶段六完成：工程化 / Testing / Docker

| Day | 主题 | 核心产出 |
| --- | ---- | ---- |
| Day 22 | 工程化与配置管理 | ConfigModule、Joi 校验、环境隔离、pino 日志、traceId、项目结构 |
| Day 23 | 测试 | 测试金字塔、TestingModule、单元测试、E2E、覆盖率 |
| Day 24 | Docker 容器化 | 多阶段构建、.dockerignore、compose 编排、健康检查 |
| Day 25 | 工程化实战整合 | 四件套串联、CI/CD、完整部署流程 |

> **一句话串联**：配置跑对（Day 22）→ 测试保没坏（Day 23）→ Docker 到处跑（Day 24）→ CI/CD 自动上线（Day 25）。

---

## 📚 阶段七完成：Redis / BullMQ / SSE / WebSocket

| Day | 主题 | 核心产出 |
| --- | ---- | ---- |
| Day 26 | Redis 缓存 | Redis 五大数据类型、Nest 整合、Cache-Aside、穿透/击穿/雪崩 |
| Day 27 | BullMQ 任务队列 | Queue/Producer/Consumer、重试退避、延迟定时、进度追踪 |
| Day 28 | WebSocket | Gateway、`@SubscribeMessage`、房间、鉴权、Redis Adapter |
| Day 29 | SSE 与实时实战 | SSE vs WebSocket、流式输出、LLM 打字机、队列进度推送 |

> **一句话串联**：Redis 加速读（Day 26）→ BullMQ 异步消化耗时任务（Day 27）→ WebSocket 双向实时（Day 28）→ SSE 单向流式推送（Day 29）。

---

## 📚 阶段八完成：NestJS 底层原理

| Day | 主题 | 核心产出 |
| --- | ---- | ---- |
| Day 30 | IoC / DI 底层原理 | `design:paramtypes`、Scanner 扫描、依赖查找三来源、四种 Provider、循环依赖 |
| Day 31 | Provider 作用域 | Singleton/Request/Transient、单例陷阱、作用域冒泡、REQUEST provider |
| Day 32 | 动态模块 | forRoot/register、Async 三件套、`global: true`、ConfigurableModuleBuilder |
| Day 33 | 装饰器与元编程 | createParamDecorator、applyDecorators、SetMetadata-Reflector 闭环 |

> **一句话串联**：容器怎么创建依赖（Day 30）→ 实例活多久（Day 31）→ 模块怎么动态生成（Day 32）→ 装饰器怎么声明意图（Day 33）。

---

## 🎓 阶段九完成：微服务 / MQ / CQRS（35 天毕业）

| Day | 主题 | 核心产出 |
| --- | ---- | ---- |
| Day 34 | 微服务与 MQ | 单体 vs 微服务取舍、传输层、`@MessagePattern`/`@EventPattern`、MQ 五大概念 |
| Day 35 | CQRS 与毕业 | CQRS 读写分离、Event Sourcing、九阶段回顾、毕业自检清单、通往 Agent |

> **一句话串联**：知道什么时候该拆服务（Day 34）→ 知道读写可以分离建模（Day 35）→ **能力收官，转向 Agent 应用开发**。

---

## 🎉 35 天全系列完结

九大阶段、35 篇笔记全部完成。完整毕业自检清单见 → [Day 35：CQRS 与 35 天毕业](/day35-cqrs-graduation)。

> 这个 35 天的目标从来不是"成为 NestJS 专家"，而是**建立完整后端能力，为 Agent 应用打基础**。下一步：RAG、Agent 编排、工具生态、Prompt 工程。

---

## 🔜 后续方向（35 天之后）

本系列 35 天已完结，接下来转向 Agent 应用开发：

> **🚀 Agent 开发已开篇**：第一篇「[Node 版 Agent 最小示例](/agent-01-node-agent)」——技术路线定调（主链路 Node 不转 Python）+ Function Call 循环 + RAG / MCP 原理，配套项目 `agent-lab/`。

- **RAG 检索增强生成**：向量数据库、Embedding、文档切分
- **Agent 编排**：工具调用（Function Call）、多 Agent 协作、记忆管理
- **Prompt 工程**：系统提示设计、Few-shot、结构化输出
- **工程深化**：链路追踪（OpenTelemetry）、可观测性、成本治理

> 后端能力已是基础设施，不再是瓶颈。把精力投向大模型应用本身。
