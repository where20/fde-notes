# 📙 Day 20：RBAC 权限控制

> 前置回顾：Day 18 搞懂认证（你是谁），Day 19 用 Passport 落地认证。本篇解决另一半——**授权（你能干什么）**，用 **RBAC** 模型 + Guard + Reflector（串 Day 6）实现细粒度权限控制。

---

## 20.1 RBAC 是什么？

**RBAC = Role-Based Access Control（基于角色的访问控制）**，是业界最通用的授权模型。

核心思路：**不直接给用户分配权限，而是给用户分配"角色"，给角色分配"权限"。**

```
用户（User） ──属于──▶ 角色（Role） ──拥有──▶ 权限（Permission）
    xiaoan           admin          create_user / delete_user / view_dashboard
```

好处：

- ✅ **解耦**：新用户入职，只需"挂个角色"，不用一个个配权限
- ✅ **可扩展**：新增权限点，只改角色定义，不动用户
- ✅ **清晰**：权限结构一目了然，方便审计

---

## 20.2 Role vs Permission（角色 vs 权限点）

很多人一开始只做"角色"层级，但真实业务需要更细的"权限点"。

| 概念 | 粒度 | 例子 | 判断方式 |
| ---- | ---- | ---- | ---- |
| **Role（角色）** | 粗 | `admin` / `editor` / `viewer` | `user.role === 'admin'` |
| **Permission（权限点）** | 细 | `user:create` / `user:delete` | `user.permissions.includes('user:delete')` |

```ts
// 粗粒度：角色
@Roles(Role.Admin)
@Delete(':id') remove() {}

// 细粒度：权限点
@Permissions(Permission.USER_DELETE)
@Delete(':id') remove() {}
```

> **推荐先用角色起步，权限点按需引入**。简单系统角色够用；复杂系统（多租户、精细控制）上权限点。Day 6 已实现过基于角色的 `RolesGuard`，本篇深化。

---

## 20.3 @Roles 装饰器 + RolesGuard（串 Day 6）

回顾 Day 6 的闭环：装饰器只写标签，Guard 读标签做判断。

```ts
// roles.decorator.ts —— 只"写标签"
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

```ts
// roles.guard.ts —— "读标签 + 判断"
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),   // 方法级标签优先
      context.getClass(),     // 类级标签兜底
    ]);

    if (!requiredRoles) return true;   // 没标 @Roles() = 公开接口

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.role === role);
  }
}
```

### Role 枚举（TypeScript 强约束）

```ts
export enum Role {
  User = 'user',
  Admin = 'admin',
  Editor = 'editor',
}
```

---

## 20.4 权限点设计（进阶）

角色不够细时，升级为权限点：

```ts
export enum Permission {
  USER_READ = 'user:read',
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
}
```

```ts
// permissions.decorator.ts
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata('permissions', permissions);
```

```ts
// permissions.guard.ts
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>('permissions', [
      context.getHandler(), context.getClass(),
    ]);
    if (!required) return true;
    const { user } = context.switchToHttp().getRequest();
    return required.every((p) => user.permissions?.includes(p));  // every = 全部满足
  }
}
```

> 注意 `some` vs `every`：角色用 `some`（满足任一角色即可），权限点常用 `every`（所有权限点都要满足）。

---

## 20.5 全局注册守卫（重点）

权限守卫要在**所有接口**生效，注册成全局：

```ts
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },   // 先认证
  { provide: APP_GUARD, useClass: RolesGuard },      // 再授权
]
```

> ⚠️ 关键点（Day 6 已强调）：
> - 全局 Guard 需要依赖注入，**必须用 `APP_GUARD` token 注册**，不能用 `app.useGlobalGuards(new RolesGuard())`（手动 `new` 拿不到 Reflector）
> - **顺序 = 注册顺序**：`JwtAuthGuard` 在前（先确认身份，把 user 挂到 request），`RolesGuard` 在后（再读 role 判断）

### 用 @Public 装饰器放行公开接口

全局挂了 JwtAuthGuard 后，登录、注册等接口会被误拦截。用装饰器标记"公开"：

```ts
// public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

```ts
// jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (isPublic) return true;          // 公开接口直接放行
    return super.canActivate(context);  // 其余走 JWT 校验
  }
}
```

```ts
@Public()
@Post('register') register() {}   // 注册无需 token

@Post('login') login() {}         // 登录也是公开（走 LocalAuthGuard）
```

> `@Public` + 全局 JwtAuthGuard 是 Nest 官方文档的经典组合，必掌握。

---

## 20.6 数据库建模（User 与 Role 关联）

Role 是 User 的一个字段（简单场景）：

```prisma
enum Role {
  user
  admin
  editor
}

model User {
  id       Int     @id @default(autoincrement())
  email    String  @unique
  password String
  role     Role    @default(user)   // 角色作为枚举字段
}
```

多角色 / 多权限点场景（多对多）：

```prisma
model User {
  id       Int    @id @default(autoincrement())
  roles    Role[]          // 一个用户多角色
}

model Role {
  id          Int    @id @default(autoincrement())
  name        String @unique
  permissions Permission[]  // 角色多权限
  users       User[]
}
```

> 简单项目：`role` 字段 + 枚举即可。多角色/精细权限才上多对多关联表。

---

## 20.7 RBAC 最佳实践

| 实践 | 说明 |
| ---- | ---- |
| 先认证后授权 | JwtAuthGuard 在前，RolesGuard 在后 |
| 用枚举约束 | `enum Role` / `enum Permission`，避免魔法字符串 |
| 方法级优先类级 | `getAllAndOverride` 让方法标签覆盖类标签 |
| 全局守卫 + @Public | 默认全部保护，公开接口显式标记（默认拒绝） |
| 无标签 = 公开 | `if (!required) return true`，避免误拦 |
| 权限最小化 | 用户只拥有完成工作所需的最小权限 |

---

## 20.8 自检清单

- [ ] RBAC 的三个核心元素是什么？它们如何关联？
- [ ] Role 和 Permission 的区别？什么时候上权限点？
- [ ] `@Roles` 装饰器和 `RolesGuard` 各自负责什么？
- [ ] `getAllAndOverride` 为什么要传 `[getHandler(), getClass()]`？
- [ ] 全局注册守卫为什么必须用 `APP_GUARD`？
- [ ] 全局 JwtAuthGuard 后，登录接口怎么放行？（`@Public`）
- [ ] 角色用 `some`、权限点用 `every` 的原因？

---

## 🔗 上下篇

← [Day 19：Passport 策略](/day19-passport) ｜ → [Day 21：认证实战整合](/day21-auth-practice)
