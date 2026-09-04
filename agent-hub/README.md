# agent-hub · 个人 AI 助手后端

> 前端转 Agent 开发 · 35 天路线的实战项目：一条主线把 NestJS 九大核心能力全用上，终点直连 Agent 应用开发。
> 配套学习资料：35 篇笔记 + 施工图见同仓库 `docs/`（[施工图 docs/hands-on-guide.md](../docs/hands-on-guide.md)）。

---

## ✨ 能力清单（35 天"学过 → 跑过"对照）

| # | 能力 | 落地位置 | 对应 Day |
| - | ---- | ---- | ---- |
| 1 | 模块化 / DI / IoC | `users` 模块骨架 | 1~2 |
| 2 | 请求生命周期五件套 | `common/`（Middleware/Pipe/Interceptor/Filter/Guard） | 3~9 |
| 3 | REST / DTO / Swagger | 规范 CRUD + `GET /api-docs` | 10~12 |
| 4 | PostgreSQL / Prisma | 落库 + 分层 + 关系建模（`User/Note/Tag`） | 13~17 |
| 5 | JWT / Passport / RBAC | `auth/` 完整认证 + 角色鉴权 | 18~21 |
| 6 | 工程化 / Testing / Docker | Joi 校验 + pino 日志 + 7 单元用例 + 12 E2E 用例 + 多阶段镜像 | 22~25 |
| 7 | Redis / BullMQ / SSE / WebSocket | 缓存 + 队列 + 流式 + 实时推送 | 26~29 |
| 8 | 动态模块原理 | 手写 `redis/` 的 `RedisModule.registerAsync` | 30~33 |
| 9 | 部署上线 | `docker-compose.prod.yml` 生产容器化 | 34~35 |

---

## 🧱 技术栈

- **框架**：NestJS 11（Express 平台）+ TypeScript
- **ORM**：Prisma 6（PostgreSQL 16）
- **认证**：Passport（local + JWT）+ bcrypt 密码哈希
- **缓存 / 队列**：Redis 7（`cache-manager` v6 + keyv 缓存；`BullMQ` 任务队列）
- **实时**：`@nestjs/websockets` + socket.io
- **日志**：nestjs-pino（结构化 JSON + traceId）
- **校验**：class-validator / class-transformer + Joi（配置校验）

---

## 📁 目录结构

```
agent-hub/
├── src/
│   ├── main.ts                  # 全局 Pipe/Interceptor/Filter + IoAdapter
│   ├── app.module.ts            # 根模块：Config/Cache/BullMQ/Redis/各业务模块
│   ├── common/                  # 通用：中间件 / 拦截器 / 过滤器 / 装饰器
│   ├── prisma/                  # PrismaService（连接 + 生命周期）
│   ├── auth/                    # JWT / Passport / RBAC（Service/Controller/Strategy/Guard）
│   ├── users/                   # Controller → Service → Repository 分层
│   ├── ai/                      # BullMQ 队列 + SSE 流式（Agent 应用核心）
│   ├── chat/                    # WebSocket 网关（/chat 命名空间）
│   └── redis/                   # 手写的 Redis 动态模块（register/registerAsync）
├── prisma/
│   ├── schema.prisma            # User / Note / Tag + Role 枚举
│   └── migrations/
├── docker-compose.yml           # 开发（db + redis 映射端口到宿主）
├── docker-compose.prod.yml      # 生产（db/redis 不暴露端口 + restart 策略）
├── Dockerfile                   # 多阶段构建（deps → build → production）
├── test/                        # E2E 测试（app.e2e-spec + 独立测试基础设施）
├── .env                         # 不提交（敏感配置）
└── .env.example                 # 提交（只含 key 名）
```

---

## 🚀 快速开始

### 1. 准备环境

- Node.js ≥ 22、Docker + Docker Compose

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少填 DB_PASSWORD 和 JWT_SECRET
```

### 3. 启动依赖（PostgreSQL + Redis）

```bash
docker compose up -d db redis
```

### 4. 装依赖 + 迁移 + 启动

```bash
npm install
npx prisma migrate dev        # 首次建表
npm run start:dev             # 开发模式（热重载）
```

启动后访问：`http://localhost:3000`，API 文档 `http://localhost:3000/api-docs`。

> ⚠️ 在 WorkBuddy 沙箱里执行 npm / nest 命令需带 `NODE_OPTIONS=`（详情见施工图「实际搭建记录」）。

### 5. 生产部署

```bash
npm run build
DOCKER_BUILDKIT=0 docker compose -f docker-compose.prod.yml up -d --build
```

### 6. 测试

```bash
# 单元测试（7 用例，无需外部依赖）
npm test

# E2E 测试（12 用例，需独立测试 PostgreSQL + Redis）
docker compose -f test/docker-compose.test.yml up -d
DATABASE_URL='postgresql://postgres:testpass@localhost:5543/agent_hub_test?schema=public' npx prisma migrate deploy
npm run test:e2e
docker compose -f test/docker-compose.test.yml down
```

E2E 覆盖链路：健康检查 → 注册/登录（JWT）→ RBAC 权限 → Redis 缓存/动态模块 → BullMQ 队列。测试基础设施用固定弱密码 `testpass` 与非冲突端口（`5543`/`6381`），与开发/生产容器完全隔离。

---

## 📡 API 一览

### 认证（部分 `@Public`）

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| POST | `/auth/register` | 注册（响应不含 password） |
| POST | `/auth/login` | 登录，返回 `accessToken` |

### 用户（RBAC）

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/users/profile` | 当前用户（需 JWT） |
| GET | `/users/admin` | 管理员专属（需 `admin` 角色） |
| POST / GET / GET:id / PATCH / DELETE | `/users` | 完整 CRUD |

### AI（队列 + 流式）

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| POST | `/ai/generate` | 提交任务，**立即返回 `jobId`**（不阻塞） |
| GET | `/ai/stream/:jobId` | SSE 流式订阅进度，直到 `completed` |

### 实时 / 缓存演示

| 方式 | 端点 | 说明 |
| ---- | ---- | ---- |
| WebSocket | `/chat` 命名空间，发 `message` 事件 | 服务端广播回推 |
| GET | `/redis/demo` | 动态模块 + Redis 读写演示 |

### 通用

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| GET | `/` | 欢迎页（Hello World） |
| GET | `/health` | 健康检查（容器 healthcheck 用） |
| GET | `/api-docs` | Swagger 文档 |

---

## 🏗️ 架构要点

- **分层**：`Controller → Service → Repository`，Repository 用 Prisma `select` 白名单排除 `password`
- **全局守卫链**：`JwtAuthGuard`（先认证，`@Public()` 跳过）→ `RolesGuard`（再鉴权，`@Roles()` RBAC）
- **统一响应 / 异常**：`ResponseInterceptor` 包 `{ code, message, data }`；`AllExceptionsFilter` 把 Prisma `P2002→409`、`P2025→404`
- **动态模块**：`RedisModule.registerAsync({ useFactory, inject })` 接收 `ConfigService` 配置，`@Global()` 全局可用

---

## 🔗 相关

- [施工图 · 从 0 跑通 NestJS 后端（含全部踩坑）](../docs/hands-on-guide.md)
- 35 篇知识点笔记见 `docs/`（Day 1~35）
