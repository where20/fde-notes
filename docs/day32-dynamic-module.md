# 📙 Day 32：动态模块（Dynamic Module）

> 前置回顾：Day 30 学了 `useFactory` 动态创建 Provider。本篇升级——**整个模块都动态化**。`JwtModule.register({ secret })`、`CacheModule.register({ ttl })`、`TypeOrmModule.forRoot(...)` 这些你用过无数次的 API，背后就是动态模块。

---

## 32.1 什么是动态模块？

**静态模块**：配置写死，导入即用。

```ts
@Module({ providers: [UserService], exports: [UserService] })
export class UserModule {}

// 使用：直接 imports，无参数
@Module({ imports: [UserModule] })
```

**动态模块**：**导入时传入配置**，根据配置生成不同的模块。

```ts
// 使用：带参数
@Module({
  imports: [
    JwtModule.register({ secret: 'xxx', signOptions: { expiresIn: '15m' } }),
  ],
})
```

> 一句话：**动态模块 = 能接收参数、运行时生成 Provider 的模块**。它让模块成为"可配置的积木"。

---

## 32.2 为什么需要动态模块？

问题：数据库地址、JWT 密钥这些配置**不该写死在模块里**（换环境就麻烦，Day 22 原则）。

```
❌ 静态模块：配置硬编码在模块内，换环境改代码
✅ 动态模块：配置从外部传入（通常读 ConfigService），同一模块多处复用
```

| 静态模块 | 动态模块 |
| ---- | ---- |
| 配置固定 | 配置由调用方决定 |
| 一个模块一份配置 | 同一模块可注册多次（不同配置） |
| `imports: [UserModule]` | `imports: [JwtModule.register({...})]` |

---

## 32.3 实现：forRoot / register 模式

这是 Nest 社区约定俗成的两种命名：

| 命名 | 语义 | 典型 |
| ---- | ---- | ---- |
| `forRoot()` | **全局/根级**配置，通常只调一次 | `TypeOrmModule.forRoot()` |
| `forRootAsync()` | 异步版本（配置来自异步源） | `TypeOrmModule.forRootAsync()` |
| `register()` | **注册一份**配置，可多次调用 | `JwtModule.register()` |
| `registerAsync()` | 异步版本 | `JwtModule.registerAsync()` |

### 同步版本（forRoot / register）

```ts
// cache.module.ts
import { DynamicModule, Module } from '@nestjs/common';

@Module({})
export class CacheModule {
  static register(options: CacheOptions): DynamicModule {
    return {
      module: CacheModule,
      providers: [
        {
          provide: 'CACHE_OPTIONS',
          useValue: options,           // 把配置注入成 Provider
        },
        CacheService,
      ],
      exports: [CacheService],
    };
  }
}
```

```ts
// 使用
@Module({
  imports: [CacheModule.register({ ttl: 60, max: 100 })],
})
```

**关键点**：

- 静态方法返回 `DynamicModule` 对象（含 `module` / `providers` / `exports`）
- `module: CacheModule` 指明"这个动态模块的宿主是谁"
- 把配置包装成 Provider（`CACHE_OPTIONS`），Service 就能 `@Inject('CACHE_OPTIONS')` 拿到

```ts
@Injectable()
export class CacheService {
  constructor(@Inject('CACHE_OPTIONS') private options: CacheOptions) {}
}
```

---

## 32.4 异步版本（forRootAsync / registerAsync）

真实场景配置来自 `ConfigService`（异步 DB 连接、远程配置中心），需要 Async 版本：

```ts
@Module({})
export class CacheModule {
  static registerAsync(options: CacheAsyncOptions): DynamicModule {
    return {
      module: CacheModule,
      imports: options.imports || [],       // 供工厂函数注入依赖
      providers: [
        {
          provide: 'CACHE_OPTIONS',
          useFactory: options.useFactory,   // 工厂函数
          inject: options.inject || [],     // 工厂函数的依赖
        },
        CacheService,
      ],
      exports: [CacheService],
    };
  }
}
```

```ts
// 使用：配置来自 ConfigService
@Module({
  imports: [
    ConfigModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        ttl: config.get<number>('CACHE_TTL'),
        host: config.get<string>('REDIS_HOST'),
      }),
      inject: [ConfigService],
    }),
  ],
})
```

> **Async 三件套**：`imports`（工厂要用的模块）+ `useFactory`（生成配置）+ `inject`（工厂的依赖）。和 Day 30 的 `useFactory` + `inject` 一脉相承。

---

## 32.5 完整对照：JwtModule 的简化实现

```ts
@Module({})
export class JwtModule {
  static register(options: JwtOptions): DynamicModule {
    return {
      module: JwtModule,
      providers: [
        { provide: 'JWT_OPTIONS', useValue: options },
        JwtService,
      ],
      exports: [JwtService],
    };
  }

  static registerAsync(options: JwtAsyncOptions): DynamicModule {
    return {
      module: JwtModule,
      imports: options.imports || [],
      providers: [
        {
          provide: 'JWT_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        JwtService,
      ],
      exports: [JwtService],
    };
  }
}
```

> 官方 `@nestjs/jwt` 的实现思路与此一致——看懂这个，所有 `xxxModule.register()` 都不再神秘。

---

## 32.6 全局动态模块（@Global）

想让动态模块全局可用（其他模块无需 imports）：

```ts
static forRoot(options): DynamicModule {
  return {
    module: XxxModule,
    global: true,            // ← 全局标记
    providers: [...],
    exports: [...],
  };
}
```

> `global: true` 等价于在类上加 `@Global()`，但只对这一次动态注册生效。

---

## 32.7 ConfigurableModuleBuilder（Nest 官方新方案）

Nest 9+ 提供了官方工具，自动生成 `register` / `registerAsync` 样板代码：

```ts
import { ConfigurableModuleBuilder } from '@nestjs/common';

export interface CacheModuleOptions {
  ttl?: number;
  host?: string;
}

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<CacheModuleOptions>()
    .setClassMethodName('register')
    .setExtras({ isGlobal: true }, (definition, extras) => ({
      ...definition,
      global: extras.isGlobal,
    }))
    .build();
```

```ts
@Module({})
export class CacheModule extends ConfigurableModuleClass {
  // 自动获得 register() 和 registerAsync()
}
```

> 好处：不用手写 `register`/`registerAsync` 两套样板，**官方帮你生成**，减少出错。

---

## 32.8 命名约定与最佳实践

| 约定 | 说明 |
| ---- | ---- |
| `forRoot` / `forRootAsync` | 根模块配置，应用级，通常只调一次 |
| `register` / `registerAsync` | 特性模块配置，可多次调用不同配置 |
| 配置 Token 加前缀 | `XxxModuleOptions` 避免冲突 |
| 总是 exports Service | 否则调用方 import 了拿不到 |
| 优先 Async 版本 | 配置来自 ConfigService，避免硬编码 |

---

## 32.9 自检清单

- [ ] 动态模块和静态模块的区别？解决什么问题？
- [ ] `DynamicModule` 对象包含哪些字段？`module` 字段指什么？
- [ ] 为什么要把配置包装成 Provider？
- [ ] `forRoot` 和 `register` 语义区别？
- [ ] Async 版本三件套是什么？为什么需要？
- [ ] `global: true` 的作用？
- [ ] `ConfigurableModuleBuilder` 解决什么痛点？

---

## 🔗 上下篇

← [Day 31：Provider 作用域（Scope）](/day31-scope) ｜ → [Day 33：装饰器与元编程](/day33-decorator-metaprogramming)
