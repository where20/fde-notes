# 📘 Day 14：Prisma 入门

> 前置回顾：Day 13 学了 PostgreSQL 基础和手写 SQL。但真实项目里手写 SQL 字符串既易错又难维护（拼接、注入、类型不安全）。本篇引入 **Prisma**——让数据库操作变得类型安全、可维护。

---

## 14.1 Prisma 是什么？

Prisma 是 Node.js 生态**新一代 ORM**（对象关系映射）。它把数据库表映射成 TypeScript 类型，让你用**代码**操作数据库，而不是拼 SQL 字符串。

| 对比 | 手写 SQL | Prisma |
| ---- | ------ | ------ |
| 类型安全 | ❌ 结果类型全靠猜 | ✅ 编译期 + 运行期类型推断 |
| 防注入 | ❌ 需手动参数化 | ✅ 自动参数化 |
| 维护性 | ❌ SQL 散落各处 | ✅ schema 集中管理 |
| 迁移管理 | ❌ 手动 | ✅ `migrate` 自动生成 |

### Prisma vs TypeORM（两大 NestJS ORM）

| 维度 | Prisma | TypeORM |
| ---- | ------ | ------- |
| 模型定义 | 专用 `schema.prisma` | 装饰器（`@Entity`） |
| 类型推断 | 极强（自动生成完整类型） | 一般 |
| 学习曲线 | 平缓 | 陡峭 |
| 生态成熟度 | 新，但增长最快 | 老牌 |
| NestJS 官方 | 文档重点推荐 | 支持良好 |

> **本系列选 Prisma**：类型推断最强大、schema 声明式清晰、社区上升趋势明显。

---

## 14.2 Prisma 三件套

Prisma 由三部分组成：

| 组件 | 作用 | 文件/产物 |
| ---- | ---- | ------- |
| **Prisma Schema** | 数据模型 + 数据源的声明 | `prisma/schema.prisma` |
| **Prisma Client** | 类型安全的数据库客户端 | `@prisma/client` |
| **Prisma Migrate** | 数据库迁移工具 | `prisma/migrations/` |

```
schema.prisma  ──(定义模型)──▶  Prisma Migrate ──(同步)──▶  PostgreSQL
      │                                                      ▲
      └──(生成)──▶  Prisma Client  ──(查询/写入)──────────────┘
```

---

## 14.3 安装与初始化

```bash
npm i prisma @prisma/client
npx prisma init
```

`prisma init` 会生成：

```
prisma/
└── schema.prisma      # 数据模型
.env                   # DATABASE_URL 数据库连接串
```

### .env 配置

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nestjs_learning"
#             用户名      密码       主机     端口  数据库名
```

---

## 14.4 schema.prisma 语法

这是 Prisma 的核心——**声明式定义数据模型**。

```prisma
// 数据源
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 模型（对应数据库表）
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  nickname  String
  role      String   @default("user")
  createdAt DateTime @default(now())

  orders Order[]       // 一对多：一个用户多个订单
}

model Order {
  id      Int     @id @default(autoincrement())
  amount  Decimal
  status  String  @default("pending")
  userId  Int     // 外键
  user    User    @relation(fields: [userId], references: [id])
}
```

### 核心语法元素

| 语法 | 含义 | 示例 |
| ---- | ---- | ---- |
| `@id` | 主键 | `@id` |
| `@default(autoincrement())` | 自增 | id |
| `@unique` | 唯一约束 | email |
| `@default(...)` | 默认值 | `@default("user")` |
| `@relation` | 定义关系 | 外键关联 |
| `?` | 字段可空 | `nickname String?` |
| `[]` | 列表（一对多） | `Order[]` |

---

## 14.5 迁移：migrate dev

改完 schema 后，生成迁移并应用到数据库：

```bash
npx prisma migrate dev --name init
```

这个命令做了三件事：
1. 生成迁移 SQL 文件（`prisma/migrations/`）
2. 应用到数据库（建表）
3. 重新生成 Prisma Client 类型

> ⚠️ **每次改 schema 都要跑 `migrate dev`**，否则数据库和代码不一致。

### 常用 migrate 命令

| 命令 | 作用 |
| ---- | ---- |
| `migrate dev --name xxx` | 开发环境：生成 + 应用迁移 |
| `migrate deploy` | 生产环境：只应用已生成的迁移 |
| `migrate status` | 查看迁移状态 |
| `migrate reset` | 重置数据库（危险，删数据） |

---

## 14.6 Prisma Client 基本 CRUD

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 增
const user = await prisma.user.create({
  data: { email: 'a@b.com', nickname: '张三' },
});

// 查（单个 / 唯一 / 列表）
const u1 = await prisma.user.findUnique({ where: { id: 1 } });
const u2 = await prisma.user.findUnique({ where: { email: 'a@b.com' } });
const list = await prisma.user.findMany();

// 改
const updated = await prisma.user.update({
  where: { id: 1 },
  data: { nickname: '李四' },
});

// 删
const deleted = await prisma.user.delete({ where: { id: 1 } });
```

### 核心方法速查

| 方法 | 作用 | 返回值 |
| ---- | ---- | ----- |
| `create` | 创建一条 | 记录 |
| `findUnique` | 按唯一字段查一条 | 记录 或 null |
| `findFirst` | 按条件查第一条 | 记录 或 null |
| `findMany` | 查多条 | 数组 |
| `update` | 更新（不存在报错） | 记录 |
| `upsert` | 有则更新无则创建 | 记录 |
| `delete` | 删除（不存在报错） | 记录 |
| `count` | 计数 | 数字 |

> 类型安全体现：`prisma.user.create` 的 `data` 参数会**自动提示**所有字段，写错字段名编译直接报错。

---

## 14.7 数据浏览：Prisma Studio

Prisma 自带一个可视化数据库管理界面：

```bash
npx prisma studio
```

打开 `http://localhost:5555`，可以像表格软件一样浏览、编辑数据。

> 调试利器：不用手动写 SQL 就能看到数据状态。

---

## 14.8 自检清单

- [ ] Prisma 是什么？它解决手写 SQL 的哪些问题？
- [ ] Prisma 三件套分别是什么？各自作用？
- [ ] schema.prisma 里 `@id`、`@unique`、`@default`、`@relation` 分别什么意思？
- [ ] 改完 schema 后要执行什么命令？
- [ ] `migrate dev` 和 `migrate deploy` 的区别？
- [ ] `findUnique` 和 `findFirst` 的区别？
- [ ] `upsert` 的作用？

---

## 🔗 上下篇

← [Day 13：PostgreSQL 基础与表设计](/day13-postgresql) ｜ → [Day 15：NestJS 整合 Prisma](/day15-nestjs-prisma)
