# 📕 Day 8：Interceptor 深入

> 前置回顾：Day 3 提过 Interceptor 用 RxJS "包裹" Handler 前后。本篇拆透它的执行模型、RxJS 操作符用法，以及统一响应/日志/超时/缓存四大实战场景。

---

## 8.1 Interceptor 是什么？

Interceptor 是**包裹 Handler 执行前后**的组件，基于 RxJS `Observable`。

```ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('Before...');                    // ① Handler 前
    const now = Date.now();
    return next.handle().pipe(                   // ② 执行 Handler
      tap(() => console.log(`After... ${Date.now() - now}ms`)), // ③ Handler 后
    );
  }
}
```

**执行顺序**：Interceptor 前 → Guard → Pipe → Controller → Interceptor 后

> 注意：Interceptor 的"前"在 Guard 之前，"后"在 Controller 之后。它是唯一能**同时**看到请求和响应的组件。

---

## 8.2 为什么能"包裹"？—— RxJS 模型

`next.handle()` 返回 `Observable`，你可以用 RxJS 操作符链式处理：

```ts
return next.handle().pipe(
  tap(data => ...),       // 副作用：日志、计时（不改数据流）
  map(data => ({ data })), // 转换：改响应结构
  catchError(err => ...),  // 捕获并转换错误
  timeout(5000),           // 超时控制
);
```

| 操作符 | 作用 | 典型场景 |
|---|---|---|
| `tap` | 执行副作用，不改数据 | 日志、耗时统计 |
| `map` | 转换数据流 | 统一响应格式 `{code, data}` |
| `catchError` | 捕获错误 | 异常转换、降级 |
| `timeout` | 超时中断 | 防止慢接口拖垮服务 |
| `of` | 构造 Observable | 缓存命中时直接返回 |

> 这是 Interceptor 和 Middleware/Guard 最大的不同：**它操作的是响应流**，而不只是请求。

---

## 8.3 实战一：统一响应格式

```ts
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map(data => ({
        code: 0,
        message: 'success',
        data,
        timestamp: Date.now(),
      })),
    );
  }
}

// 注册为全局
providers: [{ provide: APP_INTERCEPTOR, useClass: TransformInterceptor }]
```

> 所有接口返回自动包裹成 `{code, message, data, timestamp}`，前端无需每个接口单独处理。

---

## 8.4 实战二：接口耗时日志

```ts
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.log(req, Date.now() - start, 'success'),
        error: (err) => this.log(req, Date.now() - start, `error: ${err.message}`),
      }),
      timeout(5000),
      catchError(err => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
```

---

## 8.5 实战三：响应缓存

```ts
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private cache = new Map<string, any>();

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const key = ctx.switchToHttp().getRequest().url;
    if (this.cache.has(key)) {
      return of(this.cache.get(key));   // 缓存命中 → 直接返回，不执行 Handler
    }
    return next.handle().pipe(
      tap(data => this.cache.set(key, data)),
    );
  }
}
```

> `of(...)` 直接构造 Observable 返回，**Handler 完全不执行**（省了查库）。生产环境用 `@nestjs/cache-manager` + Redis。

---

## 8.6 注册方式

| 级别 | 写法 |
|---|---|
| 方法级 | `@UseInterceptors(LoggingInterceptor)` |
| 控制器级 | `@UseInterceptors() class XxxController` |
| 全局（无依赖） | `app.useGlobalInterceptors(new LoggingInterceptor())` |
| 全局（需注入） | `providers: [{ provide: APP_INTERCEPTOR, useClass: Xxx }]` |

> 和 Guard 一样：**需要依赖注入时必须用 `APP_INTERCEPTOR`**，不能 `new`。

---

## 8.7 辨析：Interceptor vs Middleware vs Guard vs Filter

| 组件 | 能看到 | 能否改响应 | 典型用途 |
|---|---|---|---|
| **Middleware** | 请求 | 需操作 `res` 对象 | 日志、CORS、traceId |
| **Guard** | 请求 + Handler Metadata | ❌ | 鉴权、RBAC |
| **Interceptor** | 请求 + **响应流** | ✅（`map`） | 统一响应、耗时、缓存、超时 |
| **Filter** | 异常 | ✅（格式化错误） | 统一异常格式 |

**一句话记忆**：Middleware 管"进来"，Guard 管"能不能进"，Interceptor 管"进出都管"，Filter 管"出错了怎么办"。

---

## 8.8 注意事项

- **必须返回 Observable** — `intercept()` 忘了 `return next.handle()`，请求会永久挂起（无响应）
- **`tap` 不修改数据**，只做副作用；要改响应结构必须用 `map`
- **全局 Interceptor 顺序**：按 `APP_INTERCEPTOR` 注册顺序，先注册的先执行"前"逻辑，后执行"后"逻辑（洋葱模型）
- **`timeout` 抛的是 `TimeoutError`**，要 `catchError` 转成 Nest 的 `RequestTimeoutException` 才能被 Filter 正确处理

---

**Day 8 自检**：Interceptor 的"前""后"分别相对什么？为什么能同时看到请求和响应？`tap` 和 `map` 区别？用哪个操作符做缓存直接返回？忘了 return 会怎样？Interceptor 和 Filter 的职责边界？

---

## 🔗 上下篇

← [Day 7：Pipe 深入](/day7-pipe) ｜ → [Day 9：Exception Filter 深入](/day9-exception-filter)
