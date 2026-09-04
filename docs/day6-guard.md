# 📙 Day 6：Guard 深入

> 前置回顾：Day 2 学了 `@Roles()` + `SetMetadata`；Day 3 知道 Guard 是"门卫"；Day 4 用 `JwtAuthGuard` 做登录校验。本篇把 Guard 彻底拆透：`CanActivate`、`ExecutionContext`、`Reflector`，以及如何手写一套完整 RBAC。

---

## 6.1 Guard 是什么？

Guard 是**决定请求能不能继续执行**的组件。它实现 `CanActivate` 接口，返回：

- `true` → 放行，进入 Interceptor → Pipe → Controller
- `false` → 抛 `ForbiddenException`（403）
- 抛自定义异常 → 走 Exception Filter

```ts
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return validateRequest(context.switchToHttp().getRequest());
  }
}
```

> Guard 在所有 Middleware 之后、Interceptor/Pipe 之前执行。

---

## 6.2 ExecutionContext（Guard 的灵魂）

Day 3 提过：Middleware 拿不到"最终要执行哪个 Handler"，而 Guard 可以——靠的就是 `ExecutionContext`。

```ts
canActivate(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest();   // HTTP 请求对象
  const handler = context.getHandler();                   // 即将执行的方法
  const controller = context.getClass();                  // 所属的 Controller 类
  return true;
}
```

| 方法 | 拿到什么 | 用途 |
|---|---|---|
| `switchToHttp().getRequest()` | Express `Request` | 读 Header / Cookie / body |
| `switchToHttp().getResponse()` | Express `Response` | 写响应头 |
| `getHandler()` | 目标方法引用 | 作为 `Reflector` 的 key 读 Metadata |
| `getClass()` | Controller 类引用 | 读类级别 Metadata |
| `getType()` | `'http'` / `'ws'` / `'rpc'` | 同一 Guard 适配多种协议 |

> **这就是为什么 JWT 用 Guard 而非 Middleware**：Guard 能读 `@Roles()` 元数据 → 实现"这个接口需要 admin 角色"。

---

## 6.3 Reflector × Metadata 闭环（串 Day 2）

```ts
// ① 自定义装饰器：只"写标签"，不执行逻辑
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// ② 在 Controller 上贴标签
@Post()
@Roles('admin')
createReport() { ... }
```

```ts
// ③ Guard 读取标签并判断（真正执行逻辑的地方）
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 读方法级 + 类级元数据
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    // 没标 @Roles() → 公开接口，直接放行
    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}
```

**`Reflector` 三个方法区别**：

| 方法 | 读取范围 |
|---|---|
| `get(key, target)` | 只读指定 target（方法或类） |
| `getAll(key, [..])` | 读多个 target，**合并**结果 |
| `getAllAndOverride(key, [..])` | 读多个 target，**优先取前者**（方法级覆盖类级） |

> 实际做 RBAC 常用 `getAllAndOverride`：方法上贴的 `@Roles()` 优先于类上的。

---

## 6.4 Guard 的三种注册方式

### ① 方法级 / 类级（最常用）

```ts
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserController {
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Delete(':id')
  remove() {}
}
```

### ② 全局（用 Provider 注入，不能用 `app.useGlobalGuards()` 传实例）

```ts
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
]
```

> 全局 Guard 需要依赖注入时，**必须**用 `APP_GUARD` token 注册；`app.useGlobalGuards(new JwtAuthGuard())` 是手动 `new`，拿不到 IoC 容器里的 Service。

### ③ 多 Guard 组合（有顺序）

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
```

执行顺序：从左到右。前面的 `return false` 或抛异常 → 后面的不执行。

> 所以 **JWT 在前、角色在后**：先确认"你是谁"，再判断"你有没有权限"。

---

## 6.5 完整 RBAC 实战

```ts
// roles.decorator.ts
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// jwt-auth.guard.ts｜确认身份
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

// roles.guard.ts｜确认权限
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required) return true;                    // 无标签 = 公开
    const { user } = ctx.switchToHttp().getRequest();
    return required.some((r) => user.role === r);
  }
}

// 使用
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Get('dashboard')
getDashboard() { return 'admin only'; }
```

---

## 6.6 Guard vs Middleware vs Interceptor（终极辨析）

| 组件 | 能否读 Handler Metadata | 能否终止请求 | 典型用途 |
|---|---|---|---|
| **Middleware** | ❌ | ✅（`res.send()`） | 日志 / CORS / traceId |
| **Guard** | ✅（`Reflector`） | ✅（返回 false / 抛异常） | 鉴权 / RBAC |
| **Interceptor** | ✅ | ✅ | 统一响应 / 耗时 / 缓存 |

**选择口诀**：
- 要**看方法元数据**决定放行 → Guard
- 只是**通用预处理**，不关心走哪个方法 → Middleware
- 要**包裹执行前后**做处理 → Interceptor

> Day 5 讲过：JWT 不用 Middleware，因为 Middleware 不知道目标方法有没有 `@Roles()`。

---

## 6.7 注意事项

- **Guard 返回值可以是 `Promise<boolean>` 或 `Observable<boolean>`** — 异步查库校验权限时常用
- **`return false` 默认抛 403**；想自定义错误码就在 Guard 里直接 `throw new UnauthorizedException()`
- **Guard 在 Pipe 之前执行** → Guard 里拿到的参数还是**未校验/未转换**的原始值，`@Param()` 还是 string
- **全局 Guard 无法用 `app.useGlobalGuards(new Xxx())` 注入依赖**，必须用 `APP_GUARD`

---

**Day 6 自检**：`CanActivate` 返回什么？`ExecutionContext` 能拿到哪三样东西？`Reflector` 的 `getAll` 和 `getAllAndOverride` 区别？为什么全局 Guard 要用 `APP_GUARD`？多个 Guard 的执行顺序？Guard 和 Middleware 最本质区别？

---

## 🔗 上下篇

← [Day 5：Middleware 深入](/day5-middleware) ｜ → [Day 7：Pipe 深入](/day7-pipe)
