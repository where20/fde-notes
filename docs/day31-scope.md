# 📙 Day 31：Provider 作用域（Scope）

> 前置回顾：Day 30 搞懂了 Nest 如何创建和注入 Provider。本篇回答一个隐藏问题——**Provider 实例是"全局唯一"还是"每请求新建"？** 这就是作用域（Scope），理解它能避开 90% 的诡异 bug。

---

## 31.1 三种作用域

| 作用域 | 生命周期 | 实例数 | 默认值 |
| ---- | ---- | ---- | ---- |
| **SINGLETON** | 整个应用共享 | 1 个 | ✅ **默认** |
| **REQUEST** | 每个请求独立 | 每请求 1 个 | |
| **TRANSIENT** | 每次注入都新建 | 每处注入 1 个 | |

```ts
import { Injectable, Scope } from '@nestjs/common';

// 默认：单例
@Injectable()
export class UserService {}

// 请求作用域
@Injectable({ scope: Scope.REQUEST })
export class RequestScopedService {}

// 瞬态
@Injectable({ scope: Scope.TRANSIENT })
export class TransientService {}
```

---

## 31.2 SINGLETON（默认）：全局唯一

```ts
@Injectable()
export class CounterService {
  private count = 0;
  increment() { return ++this.count; }
}
```

```ts
// 两个 Controller 注入同一个实例
@Controller('a') class AController {
  constructor(private counter: CounterService) {}
  @Get() get() { return this.counter.increment(); }   // → 1
}
@Controller('b') class BController {
  constructor(private counter: CounterService) {}
  @Get() get() { return this.counter.increment(); }   // → 2（共享同一实例！）
}
```

### 为什么默认单例？

- ✅ **性能好**：启动时创建一次，避免每次请求反复创建
- ✅ **可共享状态**：连接池（PrismaService）、配置缓存

> ⚠️ **单例陷阱**：单例 Service **不能持有请求级状态**（如当前用户 id）。多个请求共享同一实例，会**串数据**——这是最危险的 bug（A 用户看到 B 用户的数据）。

```ts
@Injectable()
export class BadService {
  private currentUserId: number;    // ❌ 单例里存请求级状态 = 灾难
  setUser(id: number) { this.currentUserId = id; }
}
```

---

## 31.3 REQUEST：每请求独立

每次 HTTP 请求创建**全新的实例**，请求结束销毁。

```ts
@Injectable({ scope: Scope.REQUEST })
export class TenantService {
  private tenantId: string;
  constructor(@Inject(REQUEST) private request: Request) {
    this.tenantId = request.headers['x-tenant-id'];   // 安全：每请求独立
  }
}
```

| 场景 | 说明 |
| ---- | ---- |
| **多租户** | 每请求解析租户 id |
| 请求级上下文 | 存 traceId、当前用户 |
| 需要访问 Request | 不想层层传参 |

> REQUEST 作用域可以安全持有请求级状态——因为每个请求一个实例，不会串。

---

## 31.4 TRANSIENT：每次注入都新建

**每处注入都会创建新实例**，不共享。

```ts
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {}
```

```ts
@Controller('a')
class AController {
  constructor(private log1: LoggerService, private log2: LoggerService) {}
  // log1 和 log2 是**两个不同实例**（TRANSIENT 特性）
}
```

> TRANSIENT 用得少。适合需要"独立状态"的场景（如独立的请求 ID 生成器、独立计数器）。

---

## 31.5 作用域冒泡（关键陷阱）

**依赖链上的作用域会向上冒泡**：

```
Controller  ←  REQUEST 作用域的 Service  ←  Singleton Service
    ↓
Controller 也被迫变成 REQUEST 作用域！
```

```ts
@Injectable({ scope: Scope.REQUEST })
export class TenantService {}

@Injectable()
export class OrderService {
  constructor(private tenant: TenantService) {}
  // OrderService 被"污染"成 REQUEST 作用域
}

@Controller('orders')
export class OrderController {
  constructor(private order: OrderService) {}
  // 连带 OrderController 也是 REQUEST 作用域
}
```

### 影响

| 影响 | 说明 |
| ---- | ---- |
| **性能下降** | 整条依赖链每请求重新创建，失去单例复用优势 |
| 传染性 | 一个 REQUEST 依赖会污染整条链 |

> ⚠️ **实践建议**：REQUEST 作用域会沿着依赖链向上冒泡，尽量**只在末端使用**，避免污染核心 Service。

---

## 31.6 访问请求对象：REQUEST provider

REQUEST 作用域的 Service 可以直接注入 Request：

```ts
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class CurrentUserService {
  constructor(@Inject(REQUEST) private request: Request) {}

  get userId(): number {
    return this.request.user?.userId;    // 从 Guard 设置的 user 取
  }
}
```

> 但这会引入冒泡问题。**更轻量的方案是用 `@CurrentUser` 自定义参数装饰器**（Day 21 / Day 33），它不产生作用域污染。

---

## 31.7 三种作用域对比总结

| 维度 | SINGLETON | REQUEST | TRANSIENT |
| ---- | ---- | ---- | ---- |
| 实例数 | 1（全局） | 每请求 1 个 | 每次注入 1 个 |
| 性能 | ✅ 最优 | ❌ 每请求创建 | ❌ 每处创建 |
| 可存请求状态 | ❌ **禁止** | ✅ 可以 | ✅ 可以 |
| 会冒泡污染 | — | ✅ 会 | ✅ 会 |
| 典型用途 | 连接池、配置、无状态 Service | 多租户、请求上下文 | 独立状态组件 |

---

## 31.8 自检清单

- [ ] 三种作用域的实例数分别是多少？默认哪个？
- [ ] 单例 Service 为什么不能存请求级状态？会出什么问题？
- [ ] REQUEST 作用域适合什么场景？
- [ ] 什么是作用域冒泡？为什么要注意？
- [ ] 想拿当前用户，用 REQUEST 作用域还是 `@CurrentUser` 装饰器？为什么？
- [ ] 为什么默认用单例？

---

## 🔗 上下篇

← [Day 30：IoC / DI 底层原理](/day30-ioc-di-internals) ｜ → [Day 32：动态模块（Dynamic Module）](/day32-dynamic-module)
