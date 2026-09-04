# 📗 Day 1：Module / Controller / Provider / IoC / DI

## 1.1 NestJS 在解决什么？

裸 Node.js 写大型项目很快失控；Express 给了路由但**太自由**（不约束架构）。NestJS 的价值 = **应用架构**。

## 1.2 Module：业务边界（不是"文件夹"）

```ts
@Module({ imports: [], controllers: [], providers: [], exports: [] })
export class AppModule {}
```

- `imports`：引入其他模块
- `controllers`：当前模块有哪些 Controller
- `providers`：当前模块有哪些 Provider
- Module = **模块边界 + Provider 可见性 + 依赖关系管理**

典型业务拆分：

```
AppModule
├── UserModule   (Controller + Service + Repository)
├── AuthModule   (Controller + Service + JwtStrategy)
├── AgentModule  (Controller + Service + ToolService)
└── LLMModule    (LLMService)
```

## 1.3 Controller：HTTP 层（不该堆业务）

```
HTTP Request → Controller → Service → Repository → Database
```

反例：在 Controller 里写校验/加密/写库/发事件 = "胖 Controller"。

## 1.4 Service 与 Provider

- Service 只是 Provider 最常见的一种。
- 任何能被 IoC 容器管理的对象都是 Provider（Service / Repository / Factory / Helper / Strategy …）。
- `@Injectable()` 即"把这个类注册为当前 Module 的 Provider"。

## 1.5 IoC 与 DI（本篇灵魂）

| 概念      | 全称                        | 一句话                |
| ------- | ------------------------- | ------------------ |
| **IoC** | Inversion of Control 控制反转 | **谁**负责创建对象？→ 容器   |
| **DI**  | Dependency Injection 依赖注入 | 对象**怎么**给到使用者？→ 注入 |

```ts
constructor(private readonly userService: UserService) {}
// 没有 new UserService()，由 NestJS IoC Container 注入
```

> 以前：我创建我的依赖。现在：容器创建我的依赖并交给我。

## 1.6 为什么能找到 UserService？（引出 Day 2）

TypeScript 装饰器生成 `design:paramtypes` 类型 Metadata → NestJS Scanner 读取 → 在 IoC Container 中查找并注入。

**Day 1 自检**：NestJS 为什么需要 Module？Provider 是什么？为什么 Service 不用 `new`？IoC 和 DI 是什么？
