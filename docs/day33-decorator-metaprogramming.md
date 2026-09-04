# 📙 Day 33：装饰器与元编程

> 前置回顾：Day 2 学 Decorator + Metadata，Day 21 用过 `@CurrentUser`，Day 30 搞懂 IoC 底层。本篇收官阶段八——把装饰器这条线彻底打通：**自定义装饰器 + 元编程思想**。这是 NestJS "声明式"风格的精髓。

---

## 33.1 元编程：写"操作代码的代码"

**元编程（Metaprogramming）** = 程序能"读取/修改自身结构"的编程范式。

NestJS 里到处是元编程：

```ts
@Controller('users')        // 声明：这是 /users 控制器
@Get(':id')                 // 声明：这是 GET 路由
@Roles(Role.Admin)          // 声明：需要 admin 角色
findOne(@Param('id') id: string) {}
```

> 核心思想（串 Day 2）：**装饰器只"描述"，框架负责"执行"**。你写"这是什么"，框架决定"怎么做"。

| 范式 | 写法 | 特点 |
| ---- | ---- | ---- |
| 命令式 | 一步步告诉机器怎么做 | 灵活但啰嗦 |
| **声明式（元编程）** | 描述"是什么"，框架执行 | 简洁、可读、一致 |

---

## 33.2 四种装饰器（回顾 Day 2）

| 类型 | 作用对象 | 例 |
| ---- | ---- | ---- |
| **类装饰器** | class | `@Controller()` `@Injectable()` `@Module()` |
| **方法装饰器** | method | `@Get()` `@UseGuards()` `@Roles()` |
| **属性装饰器** | property | `@ApiProperty()` `@Column()` |
| **参数装饰器** | parameter | `@Body()` `@Param()` `@CurrentUser()` |

---

## 33.3 自定义参数装饰器：createParamDecorator

最常用的自定义装饰器——从请求上下文中提取数据（串 Day 21 的 `@CurrentUser`）。

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

```ts
// 用法
@Get('profile')
getProfile(@CurrentUser() user: User) {
  return user;
}
```

### 带参数版（data 参数）

`data` 就是调用时传的参数：

```ts
export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;    // 传了 key 就取具体字段
  },
);

// 用法：只取 userId
@Get('profile')
getProfile(@CurrentUser('userId') userId: number) {}
```

---

## 33.4 applyDecorators：组合装饰器

多个装饰器经常一起用（如 Swagger + 校验），用 `applyDecorators` 打包：

```ts
import { applyDecorators } from '@nestjs/common';

// 一个装饰器 = 认证 + 角色 + Swagger 文档
export function Auth(...roles: Role[]) {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: '未登录' }),
    ApiForbiddenResponse({ description: '权限不足' }),
  );
}
```

```ts
// 用法：一行搞定认证 + 鉴权 + 文档
@Auth(Role.Admin)
@Delete(':id')
remove() {}
```

> **价值**：消除重复，保证团队里所有接口写法一致。改认证逻辑只需改一处。

---

## 33.5 自定义方法装饰器：SetMetadata + Reflector

（串 Day 2 / Day 6 / Day 20 的闭环）

```ts
// ① 装饰器：写标签
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// ② Guard：读标签 + 执行
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return required.some((r) => user.role === r);
  }
}
```

> **元编程闭环**：装饰器声明意图 → Metadata 存储 → Reflector 读取 → Guard 执行。这是 Nest 的灵魂设计。

---

## 33.6 常用自定义装饰器清单

| 装饰器 | 作用 | 实现要点 |
| ---- | ---- | ---- |
| `@CurrentUser()` | 取当前登录用户 | `createParamDecorator` + `request.user` |
| `@Public()` | 标记公开接口 | `SetMetadata` + Guard 里判断 |
| `@Roles()` | 角色权限 | `SetMetadata` + RolesGuard |
| `@Auth()` | 组合认证 | `applyDecorators` |
| `@Ip()` | 客户端 IP | `request.ip` |
| `@UserAgent()` | UA 信息 | `request.headers['user-agent']` |

```ts
// 实用：取客户端 IP
export const ClientIp = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.ip || request.connection?.remoteAddress;
  },
);
```

---

## 33.7 阶段八完成总结

| Day | 主题 | 核心产出 |
| --- | ---- | ---- |
| Day 30 | IoC / DI 底层原理 | `design:paramtypes`、Scanner 扫描、依赖查找三来源、四种自定义 Provider、循环依赖 |
| Day 31 | Provider 作用域 | Singleton/Request/Transient、单例陷阱、作用域冒泡、REQUEST provider |
| Day 32 | 动态模块 | forRoot/register、Async 三件套、`global: true`、ConfigurableModuleBuilder |
| Day 33 | 装饰器与元编程 | createParamDecorator、applyDecorators、SetMetadata 闭环 |

**一句话串联**：**搞懂容器怎么创建依赖（Day 30）→ 搞懂实例活多久（Day 31）→ 搞懂模块怎么动态生成（Day 32）→ 搞懂装饰器怎么声明意图（Day 33）**。

> 至此，前七阶段所有"为什么"的答案都补齐了。

---

## 33.8 自检清单

- [ ] 什么是元编程？Nest 为什么大量使用它？
- [ ] 四种装饰器分别作用于什么？
- [ ] `createParamDecorator` 的两个参数（data / ctx）各是什么？
- [ ] `applyDecorators` 解决什么问题？
- [ ] 装饰器-Metadata-Reflector-Guard 的闭环是什么？
- [ ] 你能手写一个 `@CurrentUser` 吗？

---

## 🔗 上下篇

← [Day 32：动态模块（Dynamic Module）](/day32-dynamic-module) ｜ → [Day 34：微服务与 MQ](/day34-microservices-mq)
