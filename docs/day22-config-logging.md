# 📙 Day 22：工程化与配置管理

> 前置回顾：前五阶段把 NestJS 的架构、请求链路、REST、数据、认证全打通了。但"能跑"不等于"能上线"。本篇进入阶段六——**工程化**：让代码可配置、可观测、可维护。

---

## 22.1 工程化解决什么问题？

一个能上线的后端，除了业务代码，还要解决：

| 问题 | 手段 | 本篇对应 |
| ---- | ---- | ---- |
| 配置随环境变化 | 环境变量 + 配置校验 | 22.2 ~ 22.3 |
| 出问题怎么排查 | 结构化日志 + traceId | 22.4 |
| 代码怎么组织 | 模块化 + 命名约定 | 22.5 |
| 改了会不会坏 | 测试（Day 23） | — |
| 怎么部署 | Docker（Day 24） | — |

> 工程化不是"加分项"，而是**上线的入场券**。没有日志和配置管理，线上出问题只能靠猜。

---

## 22.2 ConfigModule + 环境变量

**硬编码配置 = 灾难**：数据库地址、JWT 密钥写死在代码里，换环境就要改代码。

### 安装 @nestjs/config

```bash
npm install @nestjs/config
```

### 基础用法

```ts
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,          // 全局可用，无需每个模块 imports
      envFilePath: '.env',     // 加载 .env 文件
    }),
  ],
})
export class AppModule {}
```

```ts
// 注入 ConfigService 读配置
constructor(private config: ConfigService) {}

const dbUrl = this.config.get<string>('DATABASE_URL');
const port = this.config.get<number>('PORT', 3000);   // 带默认值
```

### .env 文件（放根目录，不提交 git）

```bash
# .env（示例占位符）
PORT=3000
DATABASE_URL=postgresql://user:****@localhost:5432/mydb
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=15m
```

> ⚠️ `.env` 必须加进 `.gitignore`，**绝不提交**。提交的是 `.env.example`（只含 key 名和说明，不含真实值）。

---

## 22.3 配置校验（Joi）：启动即发现错误

只读 `.env` 不够，还要**启动时校验**：缺了必填配置、类型错了，直接报错拒绝启动，而不是运行到一半才崩。

```ts
import * as Joi from 'joi';

ConfigModule.forRoot({
  isGlobal: true,
  validationSchema: Joi.object({
    NODE_ENV: Joi.string()
      .valid('development', 'production', 'test')
      .default('development'),
    PORT: Joi.number().default(3000),
    DATABASE_URL: Joi.string().required(),        // 缺失 → 启动失败
    JWT_SECRET: Joi.string().required(),
  }),
}),
```

| 校验规则 | 作用 |
| ---- | ---- |
| `.required()` | 缺失直接报错 |
| `.default(x)` | 缺省用默认值 |
| `.valid(...)` | 白名单枚举 |
| `.number()/.string()` | 类型校验 |

> **校验发生在应用启动阶段**，配置错了立刻暴露，这是工程化的关键保障。

---

## 22.4 环境隔离（development / staging / production）

不同环境加载不同配置：

```
.env                 # 默认（本地开发）
.env.production      # 生产
.env.test            # 测试
```

```ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: ['.env', `.env.${process.env.NODE_ENV}`],  // 后者覆盖前者
});
```

```ts
// 用 NODE_ENV 控制行为
if (process.env.NODE_ENV === 'production') {
  app.useLogger(false);   // 生产关掉 console 噪音
}
```

---

## 22.5 日志：从 console.log 到结构化日志

`console.log` 的问题：无级别、无格式、无上下文、生产难采集。

### Nest 内置 Logger

```ts
import { Logger } from '@nestjs/common';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  create(dto: CreateUserDto) {
    this.logger.log(`创建用户: ${dto.email}`);
    this.logger.warn('邮箱未验证');
    this.logger.error('数据库连接失败', error.stack);
  }
}
```

| 方法 | 级别 | 场景 |
| ---- | ---- | ---- |
| `log` | info | 正常流程 |
| `warn` | warning | 可恢复异常 |
| `error` | error | 需要关注的错误 |
| `debug` | debug | 调试信息 |
| `verbose` | verbose | 最详细 |

### 生产级：pino（结构化 JSON 日志）

```bash
npm install nestjs-pino pino-http
```

```ts
// main.ts
import { Logger } from 'nestjs-pino';

app.useLogger(app.get(Logger));
```

pino 输出 JSON 格式，方便 ELK / Loki 等日志系统采集分析：

```json
{ "level": 30, "time": 1710000000000, "msg": "创建用户", "email": "a@b.com" }
```

### traceId：串联一次请求的所有日志

```ts
// 中间件生成 traceId，贯穿整个请求（串 Day 5 Middleware）
req.headers['x-trace-id'] = randomUUID();
```

> 一次请求可能跨多个 Service，有了 traceId，所有日志能串起来定位问题。

---

## 22.6 项目结构规范

```
src/
├── main.ts                 # 入口：bootstrap
├── app.module.ts           # 根模块
├── common/                 # 通用：守卫/拦截器/过滤器/装饰器
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   └── decorators/
├── config/                 # 配置
├── prisma/                 # PrismaService + schema
└── modules/                # 业务模块（按领域划分）
    ├── auth/
    ├── users/
    └── orders/
```

| 原则 | 说明 |
| ---- | ---- |
| 按领域分模块 | 一个业务一个 Module（users/auth/orders） |
| 通用代码抽 common | Guard/Filter/装饰器共享 |
| Controller 薄 | 只收参调 Service，不堆业务 |
| 命名一致 | `*.controller.ts` / `*.service.ts` / `*.module.ts` |

---

## 22.7 自检清单

- [ ] 为什么配置不能硬编码？`.env` 和 `.env.example` 区别？
- [ ] `ConfigService.get('KEY', 默认值)` 怎么用？
- [ ] 为什么配置要启动时校验？Joi 的 `required` / `valid` / `default` 作用？
- [ ] 三个环境如何隔离配置？
- [ ] 为什么生产不用 `console.log`？pino 的优势？
- [ ] traceId 解决什么问题？在哪个组件生成？
- [ ] 项目结构按什么划分模块？

---

## 🔗 上下篇

← [Day 21：认证实战整合](/day21-auth-practice) ｜ → [Day 23：测试（单元 + E2E）](/day23-testing)
