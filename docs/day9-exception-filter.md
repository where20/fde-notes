# 📘 Day 9：Exception Filter 深入

> 前置回顾：Day 3 的请求链路 `M-G-I-P-C-I-E` 最后一个 E 就是 Exception Filter。本篇收尾第二阶段——拆透异常层：内置异常、自定义 Filter、以及如何统一全站错误格式。

---

## 9.1 Exception Filter 是什么？

Filter 是**统一处理异常**的组件：捕获未处理的异常，格式化成约定的响应结构返回给客户端。

```
Controller 抛异常 → Interceptor 的 catchError → Exception Filter → HTTP 响应
```

**默认行为**：NestJS 内置全局 Filter，把 `HttpException` 转成：

```json
{
  "statusCode": 404,
  "message": "Not Found",
  "error": "Not Found"
}
```

未识别的异常 → `500 Internal Server Error`。

---

## 9.2 内置异常体系

NestJS 提供了一套开箱即用的 HTTP 异常类，都继承自 `HttpException`：

| 异常 | 状态码 | 场景 |
|---|---|---|
| `BadRequestException` | 400 | 参数校验失败 |
| `UnauthorizedException` | 401 | 未登录 / Token 失效 |
| `ForbiddenException` | 403 | 无权限 |
| `NotFoundException` | 404 | 资源不存在 |
| `ConflictException` | 409 | 资源冲突（如邮箱已注册） |
| `UnprocessableEntityException` | 422 | 语义错误 |
| `TooManyRequestsException` | 429 | 限流 |
| `InternalServerErrorException` | 500 | 服务器内部错误 |
| `RequestTimeoutException` | 408 | 请求超时 |

### 用法

```ts
// ① 简单
throw new NotFoundException();

// ② 自定义消息
throw new NotFoundException('用户不存在');

// ③ 自定义响应体
throw new NotFoundException({
  statusCode: 404,
  message: '用户不存在',
  errorCode: 'USER_NOT_FOUND',
});
```

---

## 9.3 为什么需要自定义 Filter？

内置格式 `{statusCode, message, error}` 往往不符合团队规范。比如前端期望：

```json
{
  "code": 404,
  "message": "用户不存在",
  "timestamp": "2026-09-02T10:00:00.000Z",
  "path": "/users/999"
}
```

→ 自定义 Filter 统一转换。

---

## 9.4 自定义 Filter

实现 `ExceptionFilter` 接口，加 `@Catch()` 装饰器：

```ts
import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';

@Catch()   // 不传参数 = 捕获所有异常
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    // 记录日志（含堆栈，便于排查）
    this.logger.error(
      `${request.method} ${request.url} ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json({
      code: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### `@Catch()` 参数

| 写法 | 捕获范围 |
|---|---|
| `@Catch()` | 所有异常 |
| `@Catch(HttpException)` | 仅 HttpException 及其子类 |
| `@Catch(NotFoundException, ForbiddenException)` | 指定多个 |

> **最佳实践**：定义多个 Filter，按"从具体到宽泛"的顺序注册。

---

## 9.5 `ArgumentsHost` vs `ExecutionContext`

| 类型 | 使用场景 | 关系 |
|---|---|---|
| `ExecutionContext` | Guard / Interceptor | **继承**自 `ArgumentsHost`，多了 `getHandler()` / `getClass()` |
| `ArgumentsHost` | Filter | 基础版，只能 `switchToHttp()` / `switchToWs()` / `switchToRpc()` |

> Filter 里用 `ArgumentsHost`，因为异常处理**不需要**知道是哪个方法抛的（栈信息已足够）。

---

## 9.6 注册方式

```ts
// ① 方法级
@Get()
@UseFilters(new HttpExceptionFilter())
findAll() {}

// ② 控制器级
@UseFilters(HttpExceptionFilter)
@Controller('users')
export class UserController {}

// ③ 全局（main.ts，无依赖注入）
app.useGlobalFilters(new AllExceptionsFilter());

// ④ 全局（需依赖注入）
providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }]
```

> 规则同 Guard/Interceptor：**需要依赖注入用 `APP_FILTER`**。

---

## 9.7 与 Interceptor 的 `catchError` 怎么选？

| 方案 | 适用 | 特点 |
|---|---|---|
| **Exception Filter** | 全局统一错误格式 | 兜底所有异常，职责单一 |
| **Interceptor `catchError`** | 特定接口的异常转换 | 只作用于该 Interceptor 覆盖的接口，可做降级 |

**建议**：
- **统一响应结构** → Interceptor（`map`）
- **统一错误格式** → Filter
- **接口级降级**（如缓存兜底）→ Interceptor 的 `catchError`

---

## 9.8 与 ValidationPipe 的配合（串 Day 4 / Day 7）

`ValidationPipe` 校验失败会抛 `BadRequestException`，被 Filter 捕获后变成：

```json
{
  "code": 400,
  "message": ["邮箱格式不正确", "密码至少 6 位"],  // message 是数组
  "timestamp": "...",
  "path": "/users"
}
```

> 想定制成 `{code, message, errors:[...]}` 结构，就在 Filter 里判断 `exception.getResponse()` 的类型做分支处理。

---

## 9.9 注意事项

- **Filter 是请求链路最后一环**，它抛的异常不会再被自己捕获 → 避免在 Filter 里写可能出错的逻辑
- **生产环境别把堆栈返回给客户端** — 日志里记录，响应体只给 message
- **`@Catch()` 不传参数时，500 异常也会被捕获** — 注意别吞掉真正的系统错误
- **异步异常**：`async` 方法里抛的异常，NestJS 能正确捕获（返回 rejected Promise 也会被 Filter 处理）

---

**Day 9 自检**：Filter 在链路哪个位置？`ArgumentsHost` 和 `ExecutionContext` 区别？`@Catch()` 不传参数捕获什么？全局 Filter 需要注入依赖时怎么写？Filter 和 Interceptor 的 `catchError` 怎么选？

---

## 🎓 第二阶段（请求生命周期）完成

至此 Day 5~9 已完整覆盖 `M-G-I-P-C-I-E` 五个组件：

| Day | 组件 | 核心关键词 |
|---|---|---|
| Day 5 | Middleware | 通用预处理、不关心 Handler |
| Day 6 | Guard | `CanActivate`、`ExecutionContext`、`Reflector` |
| Day 7 | Pipe | 转换 + 校验、`ValidationPipe` |
| Day 8 | Interceptor | RxJS 包裹、统一响应、缓存 |
| Day 9 | Exception Filter | 统一异常格式、`ArgumentsHost` |

**下一阶段**：REST API / DTO / Validation / Swagger（3 天）

---

## 🔗 上下篇

← [Day 8：Interceptor 深入](/day8-interceptor) ｜ → [总览 · 35 天路线](/)
