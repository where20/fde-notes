# 📙 Day 30：IoC / DI 底层原理

> 前置回顾：Day 1 学过 IoC/DI 概念，Day 2 学过 Decorator + Metadata。本篇回到框架底层，回答 Day 1 留下的疑问——**"Nest 到底是怎么找到 UserService 并注入的？"**。这是从"会用 Nest"到"懂 Nest"的分水岭。

---

## 30.1 回到 Day 1 的问题

```ts
constructor(private readonly userService: UserService) {}
```

没有 `new UserService()`，Nest 凭什么知道要给我什么？三个环节缺一不可：

```
① 装饰器写元数据  →  ② 启动时扫描注册  →  ③ 容器解析依赖并注入
   (@Injectable)      (Scanner + Module)     (Injector + IoC Container)
```

---

## 30.2 环节①：装饰器写元数据（串 Day 2）

TypeScript 开启 `experimentalDecorators` + `emitDecoratorMetadata` 后，编译器会为类注入 `design:paramtypes` 元数据：

```ts
@Injectable()
export class UserController {
  constructor(private userService: UserService) {}
}
```

编译后等价于：

```ts
Reflect.defineMetadata('design:paramtypes', [UserService], UserController);
```

> **这就是答案的一半**：`@Injectable()` 让 TS 把"构造函数参数的类型"写入元数据，Nest 运行时读取它，就知道要注入什么。

> ⚠️ 为什么 Service 必须加 `@Injectable()`？**只有加了装饰器，TS 才会生成 `design:paramtypes` 元数据**。漏了就拿不到类型信息。

---

## 30.3 环节②：启动时扫描注册（Scanner）

应用启动时（`NestFactory.create`），Nest 做三件事：

```
1. 扫描（Scanner）：从 AppModule 出发，递归读取所有 @Module 元数据
   → imports / providers / controllers / exports

2. 构建模块图（Module Graph）：记录模块间依赖关系

3. 实例化（Instantiator）：为每个 Provider 创建实例，注入依赖
```

### 依赖解析流程

```
需要 UserController
  → 读 design:paramtypes = [UserService]
  → 在**当前模块的 providers** 找 UserService
  → 找到 → 已实例化？复用 : 创建
  → 创建 UserService → 它也有依赖？递归处理
  → 注入到 UserController 构造函数
```

> 找不到会报经典错误：`Nest can't resolve dependencies of UserController (...)`。

---

## 30.4 依赖查找的三个来源

Nest 找 Provider 时按这个顺序：

| 来源 | 说明 | 报错时的排查点 |
| ---- | ---- | ---- |
| **本模块 providers** | 当前 Module 注册的 | 是否漏注册？ |
| **imports 模块的 exports** | 引入模块暴露的 | 对方是否 `exports` 了？ |
| **全局模块**（`@Global`） | 如 PrismaModule | 是否加了 `@Global`？ |

```ts
// 经典坑：忘了 exports
@Module({
  providers: [UserService],
  // ❌ 没 exports → 别的模块 import 了也拿不到
})
export class UserModule {}

// ✅ 正确
@Module({
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
```

> 记忆（Day 4 三句话）：**providers = 我有什么；exports = 我愿给别人什么；imports = 我要用谁的能力**。

---

## 30.5 自定义 Provider（四种写法）

默认写法是简写（class provider），完整形态有四种：

### ① useClass（默认简写）

```ts
// 简写
providers: [UserService]
// 完整
providers: [{ provide: UserService, useClass: UserService }]
// 换实现（测试/多环境）
providers: [{ provide: UserService, useClass: MockUserService }]
```

### ② useValue（注入常量/配置）

```ts
providers: [
  { provide: 'API_KEY', useValue: 'your-key-here' },
  { provide: 'CONFIG', useValue: { timeout: 5000 } },
]
// 注入
constructor(@Inject('API_KEY') private apiKey: string) {}
```

### ③ useFactory（工厂，支持依赖注入）

```ts
providers: [
  {
    provide: 'REDIS_CLIENT',
    useFactory: (config: ConfigService) => {
      return new Redis(config.get('REDIS_URL'));
    },
    inject: [ConfigService],      // 声明工厂函数的依赖
  },
]
```

> `useFactory` 是**动态创建 Provider** 的核心（Day 32 动态模块的基础）。

### ④ useExisting（别名）

```ts
providers: [
  UserService,
  { provide: 'AliasedUserService', useExisting: UserService },
]
```

| 写法 | 场景 |
| ---- | ---- |
| `useClass` | 默认；替换实现（测试 mock） |
| `useValue` | 常量、配置对象 |
| `useFactory` | 需动态创建（读配置、连数据库） |
| `useExisting` | 给已有 Provider 起别名 |

---

## 30.6 循环依赖（Circular Dependency）

A 依赖 B，B 又依赖 A —— Nest 无法决定先创建谁。

```ts
// ❌ 循环依赖
@Injectable()
export class UserService {
  constructor(private orderService: OrderService) {}
}
@Injectable()
export class OrderService {
  constructor(private userService: UserService) {}
}
```

### 解法一：forwardRef（前向引用）

```ts
@Injectable()
export class UserService {
  constructor(
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
  ) {}
}
```

### 解法二：重构（推荐）

循环依赖是**设计坏味道**——通常说明有公共逻辑该抽出来：

```ts
// ✅ 抽出第三个服务
UserService  →  CommonService  ←  OrderService
```

> ⚠️ `forwardRef` 是止痛药不是根治。看到循环依赖，先问"是不是该抽一个 Service？"

---

## 30.7 自检清单

- [ ] Nest 注入依赖的三个环节是什么？
- [ ] 为什么 Service 必须加 `@Injectable()`？
- [ ] `design:paramtypes` 元数据是谁生成的？记录什么？
- [ ] Provider 查找的三个来源？
- [ ] 报 "can't resolve dependencies" 时怎么排查？
- [ ] 四种自定义 Provider 写法及场景？
- [ ] 循环依赖两种解法？为什么推荐重构？

---

## 🔗 上下篇

← [Day 29：SSE 与实时实战整合](/day29-sse-realtime) ｜ → [Day 31：Provider 作用域（Scope）](/day31-scope)
