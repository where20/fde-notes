# 📘 Day 5：Middleware 深入

> 前置回顾：Day 3 学习了请求生命周期 `M-G-I-P-C-I-E`，其中 Middleware 排在第一位。本篇单独拆透 Middleware 的定位、写法、注册方式，以及它与 Guard 的本质区别。

---

## 5.1 Middleware 是什么？

Middleware 是**请求到达路由处理器之前**运行的函数，可以做以下事情：

- 修改请求对象（`req`）和响应对象（`res`）
- 提前结束请求（直接 `res.send()`）
- 调用 `next()` 把控制权交给下一个中间件 / 路由处理器

```ts
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    next();
    // next() 之后可以继续执行（响应已发出后）
    console.log(`${req.method} ${req.url} - ${Date.now() - start}ms`);
  }
}
```

> Middleware 本质是 Express/Fastify 中间件，NestJS 做了封装但底层一致。

---

## 5.2 函数式 vs 类式

NestJS 支持两种 Middleware 写法：

### ① 函数式（适合简单场景）

```ts
export function loggerMiddleware(req: Request, res: Response, next: NextFunction) {
  console.log(`${req.method} ${req.url}`);
  next();
}

// 注册
@Module({
  imports: [AppModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(loggerMiddleware).forRoutes('/');
  }
}
```

### ② 类式（适合需要注入依赖的场景）

```ts
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ message: 'API Key required' });
    }
    next();
  }
}
```

> 类式可以注入 Service，函数式不行。需要读配置/查数据库 → 用类式。

---

## 5.3 注册方式：`configure` + `MiddlewareConsumer`

Middleware 不用 `@UseMiddleware()` 装饰器，而是在 Module 中通过 `NestModule` 接口注册：

```ts
@Module({
  imports: [UserModule],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware, CorsMiddleware)
      .exclude({ path: 'health', method: RequestMethod.GET })
      .forRoutes('users', 'admin');
  }
}
```

| 方法 | 作用 |
|---|---|
| `apply()` | 指定要注册的 Middleware |
| `forRoutes()` | 指定生效的路由路径 |
| `exclude()` | 排除特定路由 |

> 多个 Middleware 依次 `apply(a, b, c)`，执行顺序就是 a → b → c。

---

## 5.4 路由匹配规则

`forRoutes` 支持多种匹配方式：

```ts
// 路径前缀匹配
forRoutes('users')           // 匹配 /users, /users/*
forRoutes({ path: 'admin', method: RequestMethod.POST })

// 通配符
forRoutes('admin/*')

// 全局
forRoutes('*')
```

> 注意：NestJS 的路由匹配规则受底层 Express / Fastify 影响，通配符行为可能略有差异。

---

## 5.5 Middleware vs Guard（最容易混淆）

| 维度 | Middleware | Guard |
|---|---|---|
| 执行时机 | **最先**执行 | Middleware 之后 |
| 能拿 ExecutionContext | ❌ 只能拿 `req/res/next` | ✅ 能拿 Handler、Class Metadata |
| 能访问路由装饰器 | ❌ | ✅（`Reflector.get()`） |
| 返回值控制 | 用 `next()` 传递 | 返回 `boolean` / 抛异常 |
| 典型用途 | 日志、CORS、Body 解析、traceId | JWT 鉴权、RBAC 权限控制 |

**一句话总结**：Middleware 是**通用管道**，不关心最终走哪个 Handler；Guard 是**权限门卫**，知道当前要执行什么 Handler 及其 Metadata。

> 这就是为什么 JWT 鉴权用 Guard 而不是 Middleware——Guard 能拿到 `@Roles()` 元数据。

---

## 5.6 常见实战场景

### 场景一：请求日志 + traceId

```ts
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const traceId = crypto.randomUUID();
    (req as any).traceId = traceId;
    res.setHeader('X-Trace-Id', traceId);
    console.log(`[${traceId}] → ${req.method} ${req.url}`);
    next();
  }
}
```

### 场景二：CORS 跨域

```ts
configure(consumer: MiddlewareConsumer) {
  consumer.apply(cors()).forRoutes('*');
}
// 也可以用 @nestjs/cors，或 main.ts 中 app.enableCors()
```

### 场景三：Body 解析 / 速率限制

```ts
consumer.apply(express.json({ limit: '10mb' })).forRoutes('*');
consumer.apply(rateLimit({ windowMs: 60000, max: 100 })).forRoutes('api');
```

> 速率限制通常用 `@nestjs/throttler` 更方便（Guard 层面），Middleware 层更多用底层中间件。

---

## 5.7 注意事项

- **Global Middleware 不存在**：NestJS 没有 `app.use()` 注册全局中间件的官方方式（main.ts 中 `app.use()` 是 Express 原生用法，不走 NestJS 体系）。要全局生效 → 在 `AppModule.configure()` 中 `forRoutes('*')`。
- **`next()` 之后代码仍会执行**：Middleware 不是"调用即结束"，`next()` 之后的代码在响应发出后执行（与 Express 一致）。
- **Middleware 不支持 RxJS**：不像 Interceptor 返回 `Observable`，Middleware 是纯回调式。

---

**Day 5 自检**：Middleware 执行时机？函数式和类式区别？怎么注册？为什么不能用 `@UseMiddleware()`？Middleware 和 Guard 区别？为什么 JWT 用 Guard？

---

## 🔗 下一篇

→ [Day 6：Guard 深入](/day6-guard) — `ExecutionContext`、`Reflector`、自定义 `@Roles()` 全流程实现
