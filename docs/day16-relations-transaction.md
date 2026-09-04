# 📕 Day 16：关系建模与事务

> 前置回顾：Day 14 定义了 `User` 和 `Order` 两个模型，Day 15 打通了 NestJS + Prisma。本篇深入**关系建模**（一对多/多对多/一对一）和**事务**——真实业务里数据从来不是孤立的。

---

## 16.1 三种关系

关系型数据库的核心价值就是表达数据之间的关系。三种基本关系：

| 关系 | 含义 | 示例 |
| ---- | ---- | ---- |
| **一对多 1:N** | 一个 A 对应多个 B | 用户 → 订单 |
| **多对多 M:N** | 多个 A 对应多个 B | 文章 → 标签 |
| **一对一 1:1** | 一个 A 对应一个 B | 用户 → 个人资料 |

---

## 16.2 一对多（最常见）

### schema 定义

```prisma
model User {
  id     Int     @id @default(autoincrement())
  email  String  @unique
  orders Order[]            // ← 关系字段（不存数据库，仅类型提示）
}

model Order {
  id     Int    @id @default(autoincrement())
  amount Decimal
  userId Int                    // ← 外键字段（真实存数据库）
  user   User   @relation(fields: [userId], references: [id])   // ← 关系定义
}
```

### 关键点

| 元素 | 作用 |
| ---- | ---- |
| `userId Int` | 外键字段，真实存在数据库中 |
| `user User @relation(...)` | 关系定义，`fields` 是本表外键，`references` 是目标主键 |
| `orders Order[]` | 反向关系字段，仅类型提示，**不存数据库** |

> ⚠️ **关系字段（`user`、`orders`）不占数据库列**，只有外键字段（`userId`）才是真实的列。

### 嵌套查询（include）

```ts
// 查订单时带上所属用户
const order = await prisma.order.findUnique({
  where: { id: 1 },
  include: { user: true },        // ← 自动 JOIN，返回 user 对象
});
// { id: 1, amount: 99.9, userId: 1, user: { id: 1, email: '...', nickname: '...' } }
```

### 嵌套写入（一次创建关联数据）

```ts
// 创建用户的同时创建他的订单
const user = await prisma.user.create({
  data: {
    email: 'a@b.com',
    nickname: '张三',
    orders: {
      create: [{ amount: 99.9 }, { amount: 199.9 }],   // 嵌套创建订单
    },
  },
  include: { orders: true },
});
```

---

## 16.3 多对多

文章和标签：一篇文章多个标签，一个标签下多篇文章。

### 隐式多对多（Prisma 自动建中间表）

```prisma
model Post {
  id    Int    @id @default(autoincrement())
  title String
  tags  Tag[]             // 隐式，Prisma 自动生成 _PostToTag 中间表
}

model Tag {
  id    Int    @id @default(autoincrement())
  name  String
  posts Post[]
}
```

> 隐式多对多：两边都写 `[]`，Prisma 自动创建中间表，**无需手动建表**。

### 显式多对多（中间表有额外字段时）

当中间表需要额外信息（如"加入时间"）时，手动定义中间表：

```prisma
model Post {
  id       Int       @id @default(autoincrement())
  title    String
  tags     TagsOnPosts[]
}

model Tag {
  id    Int          @id @default(autoincrement())
  name  String
  posts TagsOnPosts[]
}

model TagsOnPosts {        // 显式中间表
  postId  Int
  tagId   Int
  addedAt DateTime @default(now())   // 中间表的额外字段
  post    Post     @relation(fields: [postId], references: [id])
  tag     Tag      @relation(fields: [tagId], references: [id])

  @@id([postId, tagId])    // 复合主键
}
```

### 多对多操作

```ts
// 给文章打标签
await prisma.post.update({
  where: { id: 1 },
  data: {
    tags: {
      connect: [{ id: 1 }, { id: 2 }],   // 连接已有标签
    },
  },
});

// 用 connectOrCreate：标签不存在则创建
await prisma.post.update({
  where: { id: 1 },
  data: {
    tags: {
      connectOrCreate: [
        { where: { name: 'NestJS' }, create: { name: 'NestJS' } },
      ],
    },
  },
});
```

### 关系操作动词

| 操作 | 作用 |
| ---- | ---- |
| `create` | 创建并关联新记录 |
| `connect` | 关联已有记录 |
| `connectOrCreate` | 有则关联，无则创建再关联 |
| `set` | 整体替换关联（多对多） |
| `disconnect` | 解除关联 |
| `delete` | 删除并解除关联 |

---

## 16.4 一对一

用户和个人资料一一对应。

```prisma
model User {
  id      Int     @id @default(autoincrement())
  email   String  @unique
  profile Profile?          // 可选一对一
}

model Profile {
  id     Int    @id @default(autoincrement())
  bio    String
  userId Int    @unique          // ← 外键加 @unique，保证一对一
  user   User   @relation(fields: [userId], references: [id])
}
```

> **一对一的实现技巧**：外键字段加 `@unique`，就保证了"一个用户只能有一个 profile"。

---

## 16.5 外键约束与级联删除

删除用户时，他的订单怎么办？

```prisma
model Order {
  id     Int    @id @default(autoincrement())
  userId Int
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### `onDelete` 选项

| 选项 | 行为 |
| ---- | ---- |
| `Cascade` | 删主表记录，级联删除关联记录 |
| `Restrict` | 有关联记录则**禁止删除**（默认） |
| `SetNull` | 删主表记录，关联记录外键置 null |
| `NoAction` | 不处理（同 Restrict） |

```ts
// Cascade 下，删除用户会同时删除其所有订单
await prisma.user.delete({ where: { id: 1 } });
// 用户的订单也被删除了
```

> ⚠️ **Cascade 很危险**：一条 `delete` 可能连锁删除大量数据。使用前务必确认业务意图。

---

## 16.6 事务：保证多条操作的一致性

### 什么时候需要事务？

```
转账：A 扣 100 元，B 加 100 元
这两个操作必须要么都成功，要么都失败。
如果 A 扣款成功、B 加款失败 → 钱凭空消失。
```

### 交互式事务

```ts
import { Prisma } from '@prisma/client';

await prisma.$transaction(async (tx) => {
  // ① 扣款
  await tx.account.update({
    where: { id: fromId },
    data: { balance: { decrement: 100 } },
  });

  // ② 加款
  await tx.account.update({
    where: { id: toId },
    data: { balance: { increment: 100 } },
  });
  // 任何一步抛异常，整个事务回滚
});
```

### 批量事务（多个独立操作）

```ts
const [user, order] = await prisma.$transaction([
  prisma.user.create({ data: { email: 'a@b.com', nickname: '张三' } }),
  prisma.order.create({ data: { amount: 99.9, userId: 1 } }),
]);
// 全部成功才提交，否则回滚
```

### 两种事务对比

| 类型 | 特点 | 适用 |
| ---- | ---- | ---- |
| 交互式 | 能拿到中间结果做判断 | 转账、库存扣减 |
| 批量 | 预先定义好所有操作 | 一次性多写 |

> **ACID 四个特性**（面试考点）：原子性 Atomicity、一致性 Consistency、隔离性 Isolation、持久性 Durability。事务就是 ACID 的体现。

---

## 16.7 自检清单

- [ ] 三种关系分别是什么？各举例一个场景？
- [ ] 关系字段（`orders Order[]`）会存到数据库吗？
- [ ] 一对一关系怎么用 schema 表达？
- [ ] 隐式和显式多对多有什么区别？什么时候用显式？
- [ ] `connect` 和 `connectOrCreate` 的区别？
- [ ] `onDelete: Cascade` 是什么意思？有什么风险？
- [ ] 事务解决什么问题？交互式和批量事务的区别？

---

## 🔗 上下篇

← [Day 15：NestJS 整合 Prisma](/day15-nestjs-prisma) ｜ → [Day 17：高级查询与实战](/day17-advanced-query)
