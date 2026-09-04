# 📗 Day 15：NestJS 整合 Prisma

> 前置回顾：Day 14 学会了 Prisma 基本用法，但都是裸写 `new PrismaClient()`。本篇把 Prisma 接入 NestJS 的 IoC 体系（Day 1），并落地 **Repository 分层**——这是后端架构的核心能力。

---

## 15.1 为什么不能到处 `new PrismaClient()`？

```ts
// ❌ 反模式：每个 Service 都 new 一个
@Injectable()
export class UserService {
  private prisma = new PrismaClient();   // 连接池泄漏、无法统一管理
}
```

问题：

| 问题 | 后果 |
| ---- | ---- |
| 连接池爆炸 | 每个实例独立连接池，连接数失控 |
| 无法复用 | 违背 IoC/DI（Day 1）原则 |
| 生命周期失控 | 进程退出时连接不关闭 |

**正解**：把 Prisma 封装成一个**可注入的 Provider**，由 NestJS 容器统一管理。

---

## 15.2 PrismaService：封装 PrismaClient

```ts
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();          // 应用启动时连接数据库
  }

  async onModuleDestroy() {
    await this.$disconnect();       // 应用关闭时断开连接
  }
}
```

> 这里用到了 Day 3 学的**应用生命周期钩子**：`onModuleInit` 在模块初始化时执行，`onModuleDestroy` 在销毁时执行。数据库连接正好对应"启动连、关闭断"。

---

## 15.3 PrismaModule：全局模块

```ts
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()                     // ← 全局模块，其他模块无需 imports 即可用
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### `@Global()` 的作用

| 是否 @Global | 使用 PrismaService 需要做什么 |
| ----------- | ------------------------ |
| ❌ 否 | 每个模块都要 `imports: [PrismaModule]` |
| ✅ 是 | 任何模块直接注入即可 |

> `@Global()` 适合 `PrismaService`、`ConfigService` 这类**通用基础设施**，避免到处重复 imports。

### 在 AppModule 中注册

```ts
@Module({
  imports: [PrismaModule, UserModule, OrderModule],
})
export class AppModule {}
```

---

## 15.4 Repository 分层：为什么需要？

Day 1 提过 `Controller → Service → Repository` 的调用链。现在落地：

```
Controller  接 HTTP 请求，收参/返回（HTTP 层）
    ↓
Service     业务逻辑：校验、组合、编排（业务层）
    ↓
Repository  数据访问：只负责和数据库交互（数据层）
```

### 为什么 Service 不能直接操作数据库？

| 场景 | 直接操作的问题 | Repository 分层的好处 |
| ---- | ------------ | ------------------ |
| 换数据库 | SQL 散落各处，难改 | 只改 Repository 一处 |
| 复用查询 | 每个 Service 各写各的 | 查询集中复用 |
| 单元测试 | 要 mock 整个数据库 | 只 mock Repository |
| 职责清晰 | Service 又管业务又管数据 | 各司其职 |

> **核心原则**：Service 不应该知道数据存在 PostgreSQL 还是 MongoDB，它只知道"调用 Repository 能拿到数据"。

---

## 15.5 完整实现

### ① UserRepository

```ts
// src/users/user.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findAll(page: number, limit: number) {
    return this.prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: { email: string; nickname: string }) {
    return this.prisma.user.create({ data });
  }

  update(id: number, data: { nickname?: string }) {
    return this.prisma.user.update({ where: { id }, data });
  }

  delete(id: number) {
    return this.prisma.user.delete({ where: { id } });
  }
}
```

### ② UserService（业务层）

```ts
// src/users/user.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async create(dto: CreateUserDto) {
    // 业务规则：邮箱唯一
    const exists = await this.userRepository.findByEmail(dto.email);
    if (exists) {
      throw new ConflictException('邮箱已存在');   // Day 9 的 409
    }
    return this.userRepository.create(dto);
  }

  async findOne(id: number) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('用户不存在');   // Day 9 的 404
    }
    return user;
  }
}
```

### ③ UserModule（注册 Provider）

```ts
// src/users/user.module.ts
import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],   // ← 两个都注册（Day 1 的 providers）
})
export class UserModule {}
```

---

## 15.6 依赖注入关系图

```
UserModule
├── UserController  ──注入──▶  UserService
│                                │
│                           ──注入──▶  UserRepository
│                                        │
│                                   ──注入──▶  PrismaService (来自全局 PrismaModule)
```

> 这条链完美呼应 Day 1 的 IoC/DI：**全程没有 `new`，全由 NestJS 容器创建并注入**。

---

## 15.7 出参 DTO 衔接（串 Day 11）

Repository 返回的是 Prisma 生成的实体，直接返回会泄露内部字段。用 Day 11 的出参 DTO 转换：

```ts
@Get(':id')
async findOne(@Param('id', ParseIntPipe) id: number) {
  const user = await this.userService.findOne(id);
  return plainToInstance(UserResponseDto, user);   // 只暴露安全字段
}
```

---

## 15.8 自检清单

- [ ] 为什么不能到处 `new PrismaClient()`？
- [ ] `PrismaService` 为什么要实现 `OnModuleInit` 和 `OnModuleDestroy`？
- [ ] `@Global()` 装饰器的作用？适合用在哪些 Provider？
- [ ] Repository 分层的三个好处？Service 为什么不能直接操作数据库？
- [ ] Controller / Service / Repository 各自职责？
- [ ] Repository 的 Provider 要在哪里注册？

---

## 🔗 上下篇

← [Day 14：Prisma 入门](/day14-prisma-intro) ｜ → [Day 16：关系建模与事务](/day16-relations-transaction)
