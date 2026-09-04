# 🔧 实战施工图：从 0 跑通一个能上线的 NestJS 后端

> **这份文档解决什么**：35 篇笔记是"知识点地图"，这份是"施工图"——一条**能照着敲、每步有验收**的主线。
> **配套关系**：每阶段标注对应的 Day 篇目，遇到"为什么"回看笔记，这里只管"怎么做"。
> **项目**：`agent-hub`（个人 AI 助手后端）——一条线把九阶段核心能力全用上，终点直连 Agent 开发。

> **✅ 实际搭建记录（2026-09-03，阶段 0 ~ 六已跑通）**：项目搭在 `/Users/xiaoan/Desktop/FDE/agent-hub`（放工作区里，因为 WorkBuddy 沙箱的 broker 只允许 node 子进程在工作区内做文件写操作）。环境坑记一下：
> 1. **装依赖被拦截**：沙箱 broker 会拦 npm 的 `mkdir/symlink/rename`（报 `CODEBUDDY_BROKER_DENY: Brokered host mkdir requires an available runtime file rule`）。解法：清空 shim 再装——`NODE_OPTIONS= npm install`（`nest build` / `node dist/main.js` 同理带上 `NODE_OPTIONS=`）。
> 2. **数据库端口冲突**：本机 5432 已被 `jingcai-postgres` 容器占用，本项目 db 改为映射 `5433:5432`（`docker-compose.yml` 已改）。容器内连库仍用服务名 `db`，不受影响。
> 3. **Prisma 7 装不上（镜像缺包）**：最新 `prisma@7` 依赖 `@distilled.cloud/aws@1.0.0-rc.6`，npmmirror 镜像未收录，报 `ETARGET No matching version`。解法：降到成熟的 6.x——`NODE_OPTIONS= npm i @prisma/client@^6 && NODE_OPTIONS= npm i -D prisma@^6`（当前 6.19.3，client 与 CLI 版本保持一致）。
> 4. **阶段四已落库**：`User/Note/Tag` 三表 + `_NoteToTag` 隐式多对多连接表已建（`npx prisma migrate dev --name init`）；分层 `Controller → Service → Repository` 已打通；Repository 用 `select` 白名单排除 `password`；AllExceptionsFilter 已把 Prisma `P2002`→409、`P2025`→404。**分水岭验收通过：重启服务后数据仍在**。
> 5. **阶段五认证已跑通**：`auth/` 模块（LocalStrategy 用 email 当用户名、JwtStrategy 从 Bearer 提取、JwtAuthGuard 全局 + `@Public()` 跳过、RolesGuard + `@Roles()` 做 RBAC）。`bcrypt` 原生模块在沙箱可用（hash 60 位，无需降级 bcryptjs）。5 条验收全过：注册无 password、登录返回 accessToken、带 token 访问 `/users/profile` 200、无 token 401、user 角色访问 admin 接口 403。两个坑：①`@nestjs/jwt` 的 `expiresIn` 是 ms 库 `StringValue` 字面量，`process.env` 宽泛 string 不兼容，需 `as any`；②切 bcrypt 后阶段四的**明文密码旧数据无法登录**，需 `TRUNCATE "User" CASCADE` 清空重注册。
> 6. **阶段六工程化已跑通**：`ConfigModule` + Joi 校验（缺 `DATABASE_URL`/`JWT_SECRET` 启动即报错）、`nestjs-pino` 结构化日志、`/health` 端点、`users/auth` 单元测试（7 用例）、多阶段 `Dockerfile` + `docker-compose` 加 app 服务。4 条验收全过。坑：①`@nestjs/config`/`@nestjs/testing` 版本要对齐 NestJS 11（`config@^4`、`testing@^11`，装 12 会 peer 冲突）；②`config.get` 返回 `string|undefined`，passport-jwt 要非 undefined，改 `getOrThrow`；③沙箱里 `docker compose build` 的 buildx 写 `~/.docker/buildx/activity` 被拒，需 `DOCKER_BUILDKIT=0`；④**Dockerfile 多阶段 production 必须从 build 阶段 COPY `node_modules`**（含 `prisma generate` 产出的 `.prisma/client`），否则运行时 `Role` 是 undefined 报错。
> 7. **阶段七 Redis / BullMQ / SSE / WebSocket 已跑通**：4 条验收全过。核心是"AI 对话"异步三件套——`POST /ai/generate` 秒回 `jobId`、`SSE /ai/stream/:jobId` 流式吐进度、`BullMQ` Worker 后台消化慢任务；另配 `@nestjs/cache-manager` 缓存 `findOne`（`x-cache` 头 MISS→HIT，命中后无 SQL）和 `ChatGateway` WebSocket 回推。三个坑：①**@nestjs/bullmq v11 的 Processor 必须 `extends WorkerHost` 并实现 `process(job)` 方法**（没有 `@Process()` 方法装饰器了，这是和旧 @nestjs/bull 最大的差异）；②**缓存 redis store 用 `cache-manager` v6 + `@keyv/redis`**（`cache-manager-redis-yet` 已弃用，官方转 Keyv）；③**全局 `ResponseInterceptor` 会包住 SSE 的 MessageEvent 导致流失效**，要检测 `@Sse` 元数据（`Reflect.getMetadata('__sse__', handler)`）原样透传。版本对齐：`@nestjs/cache-manager@^3` `cache-manager@^6` `keyv@^5` `@keyv/redis@^5` `@nestjs/bullmq@^11` `bullmq@^5`（bullmq 6 是 peer 超范围，必须锁 5.x）`@nestjs/websockets@^11` `@nestjs/platform-socket.io@^11`（自带 socket.io）。`main.ts` 里 `app.useWebSocketAdapter(new IoAdapter(app))` 才启用 socket.io 命名空间。
> 8. **阶段八动态模块已跑通**：手写 `src/redis/` 动态模块——`redis.constants.ts`（`REDIS_MODULE_OPTIONS`/`REDIS_CLIENT` token）、`redis.interfaces.ts`（Options/AsyncOptions/Factory）、`redis.module.ts`（`register()` + `registerAsync()`，核心是 `createAsyncOptionsProvider` 把 `useFactory` 包装成 options provider + `createClientProvider` 用 options new ioredis）、`redis.service.ts`（get/set/del/ping 封装 + OnModuleDestroy 断连）。`@Global()` 让任何模块免 imports 直接注入 `RedisService`。验收：AppModule 里 `RedisModule.registerAsync({ useFactory: (config) => ({host,port}), inject: [ConfigService] })`，AppController 注入 RedisService，`GET /redis/demo` 返回 `{ping:'PONG', value:...}`——证明 `useFactory + inject` 让模块真正接收了 ConfigService 的配置。**ioredis 用 bullmq 已有的 5.x（锁 `^5`，6.x 会另起一套）**。
> 9. **阶段九部署上线已跑通（35 天收官）**：新增 `docker-compose.prod.yml`（生产版：db/redis **不暴露端口到宿主**、全服务 `restart: unless-stopped`、app 只开 3000）。验收：`npm run build` 产出成功 + `DOCKER_BUILDKIT=0 docker compose -f docker-compose.prod.yml up -d --build` 后 app/db/redis 全 healthy；`/health` 200；**数据持久化**（`/users` 里的 id 6/7 经历多次容器 down/up 仍在）；`/redis/demo`、`/ai/generate`+SSE 完整链路容器内全通。**微服务/MQ/CQRS 按"了解即可"定位，未改现有项目**（要点速记已补在阶段九章节）。至此 **9 个阶段 0→上线全部跑通**，`agent-hub` 从 `Hello World` 到「认证 + RBAC + 落库 + 缓存 + 队列 + SSE + WebSocket + 动态模块 + 容器化部署」的完整后端。
> 10. **收官补充：E2E 测试 + CI/CD（2026-09-03）**：补了 `test/` 目录（此前只有 `src/*.spec.ts` 单元测试）——`test/setup-env.ts`（jest `setupFiles` 先设测试专用 `DATABASE_URL`/`REDIS_*`，`ConfigModule` 底层 dotenv 默认 `override:false` 不覆盖，故测试值优先）、`test/jest-e2e.json`（`rootDir:"."` + `testRegex:.e2e-spec.ts$` + `--runInBand`）、`test/app.e2e-spec.ts`（12 用例：健康检查 → 注册/登录 JWT → RBAC 401/403 → Redis 动态模块 → BullMQ）、`test/docker-compose.test.yml`（**独立测试基础设施**：`agent-hub-test-db` 映射 `5543`、`agent-hub-test-redis` 映射 `6381`，固定弱密码 `testpass`，与开发/生产容器隔离）。**坑 ①根路径 `GET /` 没标 `@Public()` 被全局 JwtAuthGuard 拦成 401**，补上 `@Public()`（欢迎页本应公开）。**坑 ②测试输出含 JWT/password 触发沙箱敏感审批超时（SIGTERM）**，改用「输出重定向到文件 + Node 脚本脱敏后只提统计」定位失败。CI/CD 落在 `.github/workflows/`：`agent-hub-ci.yml`（GitHub 服务容器起 PostgreSQL:5543 + Redis:6381 → `npm ci` → `prisma migrate deploy` → 单测 → E2E → build，端口与 `setup-env.ts` 一致故本地/CI 行为统一）、`deploy-docs.yml`（VitePress 构建 + `upload-pages-artifact` + `deploy-pages` 上 GitHub Pages，`config.ts` 加 `base: process.env.VITE_BASE || '/'` 支持项目站点子路径）。**前提**：FDE 目前还不是 git 仓库，推上 GitHub 后工作流才生效（Pages 需在 Settings 选 "GitHub Actions"）。

---

## 0. 项目定位与最终形态

**为什么选这个项目**：它同时覆盖 CRUD、认证、异步任务、流式输出、缓存——正好是 Agent 应用的后端骨架。做完它，Day 35 的能力对照表就从"学过"变成"跑过"。

```
agent-hub 能力清单
├── 用户体系     注册/登录/JWT/RBAC          ← Day 18~21
├── 会话与消息   Conversation + Message      ← Day 13~17（关系建模）
├── 笔记 CRUD    文章 + 标签（多对多）        ← Day 16
├── AI 对话      SSE 流式输出               ← Day 29
├── 异步任务     BullMQ 处理慢任务           ← Day 27
├── 缓存         Redis 缓存热点查询          ← Day 26
└── 部署         Docker + CI/CD             ← Day 24~25
```

---

## 1. 阶段 0：环境与脚手架

### 1.1 环境要求（当前实测版本）

| 工具 | 版本 | 检查命令 |
| ---- | ---- | ---- |
| Node.js | v22.22.2 | `node -v` |
| pnpm | 10.33.0 | `pnpm -v` |
| Docker | 29.7.2 | `docker -v` |
| Docker Compose | v5.5.0 | `docker compose version` |
| Nest CLI | 需装 | `nest --version` |

### 1.2 装 Nest CLI + 创建项目

```bash
pnpm add -g @nestjs/cli

nest new agent-hub
# 包管理器选 pnpm

cd agent-hub
pnpm run start:dev
```

**✅ 验收**：

```bash
curl http://localhost:3000
# → Hello World!
```

> 看到 `Hello World!` 才算阶段 0 通过。端口被占用就换：`pnpm run start:dev -- --port 3001`

### 1.3 起依赖服务（PostgreSQL + Redis）

项目根目录建 `docker-compose.yml`（**新版 Compose 不需要 `version` 字段**）：

```yaml
services:
  db:
    image: postgres:16
    container_name: agent-hub-db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: agent_hub
    ports:
      - '5432:5432'
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: agent-hub-redis
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  db-data:
```

**✅ 验收**：

```bash
docker compose up -d
docker compose ps
# → 两个容器状态 Up (healthy)

docker compose exec db psql -U postgres -c "SELECT 1"
# → 返回 1，数据库可用
```

---

## 2. 九阶段施工图

每阶段统一 4 件套：**🎯 目标 / 📦 装什么 / 📝 写什么 / ✅ 验收**。

---

### 阶段一 · Module / DI / IoC（Day 1~2）

**🎯 目标**：搭出 `users` 模块骨架，理解"为什么 Service 不用 new"。先用**内存数组**存数据（不碰数据库，专注架构）。

**📦 装什么**：无新增。

**📝 写什么**：

```
src/
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/create-user.dto.ts
└── app.module.ts       # imports: [UsersModule]
```

```ts
// users.service.ts —— 内存数组版
@Injectable()
export class UsersService {
  private users: User[] = [];

  create(dto: CreateUserDto) {
    const user = { id: ++this.seq, ...dto };
    this.users.push(user);
    return user;
  }

  findAll() { return this.users; }
  findOne(id: number) { return this.users.find((u) => u.id === id); }
}
```

**✅ 验收**：

```bash
curl -X POST localhost:3000/users -H 'Content-Type: application/json' \
  -d '{"email":"a@b.com","nickname":"xiaoan"}'
# → {"id":1,"email":"a@b.com","nickname":"xiaoan"}

curl localhost:3000/users
# → [{"id":1,...}]
```

> 自检：Controller 里有没有 `new UsersService()`？（不该有）

---

### 阶段二 · 请求生命周期（Day 3~9）

**🎯 目标**：装上五件套，让 API 具备"可观测、可校验、错误统一"的工程底线。

**📦 装什么**：

```bash
pnpm add class-validator class-transformer
```

**📝 写什么**：

```
src/common/
├── middleware/logger.middleware.ts    # traceId + 请求日志
├── interceptors/response.interceptor.ts  # 统一 {code,data}
├── filters/all-exceptions.filter.ts   # 统一错误格式
└── decorators/
```

```ts
// main.ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
app.useGlobalInterceptors(new ResponseInterceptor());
app.useGlobalFilters(new AllExceptionsFilter());
```

**✅ 验收**（4 条全过才算通）：

| # | 验证 | 命令 / 操作 | 期望 |
| - | ---- | ---- | ---- |
| 1 | Middleware | 发任意请求，看控制台 | 出现带 `traceId` 的日志 |
| 2 | Interceptor | `curl localhost:3000/users` | 响应被包成 `{"code":0,"data":[...]}` |
| 3 | Pipe | POST 一个缺字段的 body | 返回 **400** 且是统一错误格式 |
| 4 | Filter | `curl localhost:3000/nonexistent` | 返回 **404** 且是统一错误格式 |

---

### 阶段三 · REST / DTO / Swagger（Day 10~12）

**🎯 目标**：把 users 做成规范 CRUD，文档自动生成。

**📦 装什么**：

```bash
pnpm add @nestjs/swagger
```

**📝 写什么**：完整的 `GET/POST/PATCH/DELETE` + 出入参 DTO + `@ApiProperty`。

**✅ 验收**：

```bash
# 1. 打开文档
open http://localhost:3000/api-docs
# → 看到 users 分组，4 个接口都在

# 2. 状态码正确
curl -i -X POST localhost:3000/users -H 'Content-Type: application/json' -d '{...}'
# → 201 Created

curl -i -X DELETE localhost:3000/users/1
# → 204 No Content
```

> 自检：URL 里有没有动词？（不该有）直接返回数据库实体了吗？（不该）

---

### 阶段四 · PostgreSQL / Prisma（Day 13~17）

**🎯 目标**：从内存数组切到真实数据库，建立分层与关系。

**📦 装什么**：

```bash
pnpm add @prisma/client
pnpm add -D prisma
npx prisma init
```

**📝 写什么**：

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  password  String
  role      Role     @default(user)
  notes     Note[]
  createdAt DateTime @default(now())
  deletedAt DateTime?
}

model Note {
  id     Int    @id @default(autoincrement())
  title  String
  userId Int
  user   User   @relation(fields: [userId], references: [id])
  tags   Tag[]
  @@index([userId])
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String @unique
  notes Note[]
}
```

分层：`Controller → Service → Repository`。

**✅ 验收**：

```bash
npx prisma migrate dev --name init
# → 迁移成功

npx prisma studio
# → 浏览器打开，能看到 User / Note / Tag 三张表

curl -X POST localhost:3000/users ... && curl localhost:3000/users
# → 数据在重启后依然存在（真的落库了）
```

> **关键验收**：重启服务，数据还在。这是"真落库"和"内存数组"的分水岭。

---

### 阶段五 · JWT / Passport / RBAC（Day 18~21）

**🎯 目标**：完整认证体系——注册加密、登录发 token、接口保护、角色鉴权。

**📦 装什么**：

```bash
pnpm add @nestjs/jwt @nestjs/passport passport passport-local passport-jwt bcrypt
pnpm add -D @types/passport-local @types/passport-jwt @types/bcrypt
```

**📝 写什么**：`auth/` 模块（LocalStrategy / JwtStrategy / Guards / DTO）。

**✅ 验收**（5 条，这是最该严格的一环）：

| # | 场景 | 命令 | 期望 |
| - | ---- | ---- | ---- |
| 1 | 注册 | POST `/auth/register` | 返回用户，**响应里没有 password 字段** |
| 2 | 登录 | POST `/auth/login` | 返回 `accessToken` |
| 3 | 带 token | `curl -H "Authorization: Bearer <token>" /users/profile` | 返回当前用户 |
| 4 | 无 token | `curl /users/profile` | **401** |
| 5 | 权限不足 | 用 user 角色 token 访问 admin 接口 | **403** |

> 自检：数据库里存的密码是明文吗？（必须是 bcrypt 哈希）

---

### 阶段六 · 工程化 / Testing / Docker（Day 22~25）

**🎯 目标**：配置可校验、日志可追踪、测试可回归、部署可重复。

**📦 装什么**：

```bash
pnpm add @nestjs/config joi nestjs-pino pino-http
pnpm add -D @nestjs/testing jest supertest @types/supertest
```

**📝 写什么**：`ConfigModule` + Joi 校验、pino 日志、`*.spec.ts`、`Dockerfile`（多阶段）、`.dockerignore`。

**✅ 验收**：

```bash
# 1. 配置校验（删掉 .env 里的必填项再启动）
pnpm run start:dev
# → 启动失败并明确报缺哪个配置  ✅ 这才是正确的

# 2. 测试
pnpm test
# → 用例全部通过

# 3. 健康检查端点
curl localhost:3000/health
# → {"status":"ok"}

# 4. 容器化
docker compose up -d --build
docker compose ps
# → app / db / redis 全部 Up (healthy)
```

---

### 阶段七 · Redis / BullMQ / SSE / WebSocket（Day 26~29）

**🎯 目标**：缓存加速、异步消化慢任务、实时推送——Agent 应用的核心三件套。

**📦 装什么**：

```bash
# 缓存：cache-manager v6 + keyv 适配器（注意不是旧版 cache-manager-redis-store）
pnpm add @nestjs/cache-manager cache-manager keyv @keyv/redis
# 队列：注意 bullmq 锁 5.x（6.x 超出 @nestjs/bullmq 的 peer 范围）
pnpm add @nestjs/bullmq bullmq@5
# WebSocket：platform-socket.io 自带 socket.io
pnpm add @nestjs/websockets @nestjs/platform-socket.io
```

**📝 写什么**：Redis 缓存装饰器、BullMQ 队列 + Worker、SSE 流式接口。

**✅ 验收**：

| # | 能力 | 怎么验 | 期望 |
| - | ---- | ---- | ---- |
| 1 | 缓存 | 连续两次 `GET /users/1`，看日志 | 第二次命中缓存，无 SQL 日志 |
| 2 | 队列 | POST `/ai/generate` | **立即返回** `jobId`，不阻塞 |
| 3 | SSE | `curl -N localhost:3000/ai/stream/<jobId>` | 进度持续流出直到完成 |
| 4 | WebSocket | 用 ws 客户端连 `/chat` 发消息 | 收到服务端回推 |

---

### 阶段八 · 底层原理（Day 30~33）

**🎯 目标**：把前面"用过但不懂原理"的东西自己实现一遍——抽一个可配置的动态模块。

**📝 写什么**：把 Redis 封装成 `RedisModule.registerAsync({...})` 动态模块（Day 32 模式）。

**✅ 验收**：

```ts
// 能在别的模块这样用，且配置来自 ConfigService
RedisModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({ url: config.get('REDIS_URL') }),
  inject: [ConfigService],
})
```

> 标准：能用 `useFactory` + `inject` 让模块接收外部配置，就算真懂了动态模块。

---

### 阶段九 · 微服务 / MQ / CQRS（Day 34~35）

**🎯 目标**：**了解即可，不改现有项目**。重点是把项目真正部署上线。

**✅ 验收**：

```bash
# 生产构建
pnpm run build
# → dist/ 产出成功

docker compose -f docker-compose.prod.yml up -d
# → 服务在服务器跑起来，健康检查通过
```

> 本阶段不要为了"用上 CQRS"去重构项目——路线图定位就是了解。

**📚 了解即可的要点（Day 34~35 速记，不懂不影响 agent-hub 上线）：**

| 概念 | 一句话 | 什么时候才需要 |
| ---- | ---- | ---- |
| 微服务 | 把单体按业务拆成多个独立部署的小服务 | 团队大、业务边界清晰、需独立扩缩容 |
| 消息队列 MQ | 服务间异步解耦（BullMQ 就是它的简化形态，你已经会了） | 削峰、异步、跨服务通信 |
| CQRS | 读写分离：Command 写 / Query 读，两套模型 | 读写负载差异大、需要事件溯源时 |
| 事件溯源 | 不存最终态，存"发生过的事件"重放得到状态 | 审计、可回放、复杂业务 |

> **关键判断**：单机 + 单体 + BullMQ + Prisma 已经能扛住绝大多数个人/小团队 Agent 应用。微服务/MQ/CQRS 是"团队规模到了"才上的手段，不是起步标配。**35 天路线的正解：先上线单体，业务逼着你拆时再拆。**

---

## 3. 最终目录结构（跑完长这样）

```
agent-hub/
├── src/
│   ├── main.ts                  # 全局 Pipe/Interceptor/Filter
│   ├── app.module.ts
│   ├── common/                  # 通用：中间件/拦截器/过滤器/装饰器/守卫
│   ├── config/                  # 配置 + Joi 校验
│   ├── prisma/                  # PrismaService
│   ├── auth/                    # JWT / Passport / RBAC
│   ├── users/                   # Controller → Service → Repository
│   ├── notes/                   # 笔记 CRUD（含标签多对多）
│   ├── ai/                      # BullMQ 队列 + SSE 流式
│   └── redis/                   # 动态模块封装
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── test/                        # E2E
├── docker-compose.yml           # 开发（db + redis）
├── docker-compose.prod.yml      # 生产（+ app）
├── Dockerfile                   # 多阶段构建
├── .env                         # 不提交
└── .env.example                 # 提交（只含 key 名）
```

---

## 4. 依赖总清单（按阶段累加）

| 阶段 | 依赖 |
| ---- | ---- |
| 基础 | `@nestjs/cli`（全局） |
| 二 | `class-validator` `class-transformer` |
| 三 | `@nestjs/swagger` |
| 四 | `@prisma/client` `prisma`(D) |
| 五 | `@nestjs/jwt` `@nestjs/passport` `passport` `passport-local` `passport-jwt` `bcrypt` |
| 六 | `@nestjs/config` `joi` `nestjs-pino` `pino-http` + `jest` `supertest` `@nestjs/testing`(D) |
| 七 | `@nestjs/cache-manager` `cache-manager` `keyv` `@keyv/redis` `@nestjs/bullmq` `bullmq@5` `@nestjs/websockets` `@nestjs/platform-socket.io` |

> `(D)` = devDependencies

---

## 5. 排错速查

| 报错 | 原因 | 解法 |
| ---- | ---- | ---- |
| `Nest can't resolve dependencies of Xxx` | Provider 三处问题 | 查：①注册到 providers？②对方 exports 了？③自己 imports 了？ |
| `ValidateNested` 不生效 | 少了 `@Type()` | 嵌套校验必须 `@ValidateNested()` + `@Type(() => Xxx)` |
| 数据库连不上 | 容器未就绪 / 地址错 | `docker compose ps` 看 health；**容器内用服务名 `db`**，不是 localhost |
| 401 但 token 是对的 | 密钥不一致 | `JwtStrategy.secretOrKey` 必须和签发时**同一个密钥** |
| 全局 Guard 后登录被拦 | 没标 `@Public` | 登录/注册接口加 `@Public()` |
| 改了代码服务没重启 | watch 失效 | 重启 dev server；检查 `.env` 变更不会触发热重载 |
| 容器里 Prisma Client 缺失 | 构建时没 generate | Dockerfile 里加 `RUN npx prisma generate` |
| SSE 客户端断开后内存涨 | 定时器没清理 | Observable **返回清理函数**，`res.on('close')` 清理 |
| SSE 流被包成 `{code,data}` 流失效 | 全局 ResponseInterceptor 包了 MessageEvent | 拦截器里检测 `__sse__` 元数据原样透传 |
| `InvalidProcessorClassError` | @nestjs/bullmq v11 处理器写法变了 | Processor 类 `extends WorkerHost` + 实现 `process(job)`，无 `@Process()` |
| bullmq 装成 6.x 报 peer 冲突 | 6.x 超出 @nestjs/bullmq 的 peer 范围 | 锁 `bullmq@^5` |

---

## 6. 节奏建议

| 阶段 | 建议投入 | 关键提醒 |
| ---- | ---- | ---- |
| 0 + 一 | 半天 | 别纠结，先把 Hello World 和模块骨架跑起来 |
| 二 | 1~2 天 | **最该扎实**——五件套是所有后续的地基 |
| 三 + 四 | 2~3 天 | 切数据库是第一个分水岭，验收"重启数据还在" |
| 五 | 2 天 | 严格按 5 条验收走，认证出问题最致命 |
| 六 | 2 天 | 测试别跳过，它是你后面敢重构的底气 |
| 七 | 2 天 | 队列 + SSE 是 Agent 应用的核心，重点练 |
| 八 + 九 | 1~2 天 | 原理反刍 + 部署上线 |

> **最重要的一条**：每阶段结束必须跑完"✅ 验收"再进下一阶段。跳过验收 = 后面出问题不知道是哪层塌了。

---

## 🔗 相关

← [总览 · 35 天路线](/)

各阶段对应的知识点见侧边栏 Day 1~35 各篇。
