# 📙 Day 17：高级查询与实战

> 前置回顾：Day 13~16 完成了 PostgreSQL → Prisma → NestJS → 关系建模的完整链路。本篇收官阶段四：**高级查询**（分页/过滤/排序/聚合）与一个完整 CRUD 实战，把学到的所有东西串起来。

---

## 17.1 分页：skip / take

```ts
// 第 2 页，每页 20 条
const users = await prisma.user.findMany({
  skip: (page - 1) * limit,   // 跳过前 N 条
  take: limit,                // 取 N 条
});
```

### 完整分页（返回总数）

```ts
const [users, total] = await prisma.$transaction([
  prisma.user.findMany({ skip: (page - 1) * limit, take: limit }),
  prisma.user.count(),
]);

return {
  list: users,
  total,
  page,
  limit,
  totalPages: Math.ceil(total / limit),
};
```

> ⚠️ `skip` 在大数据量下性能差（要扫过前面所有行）。**深分页**场景（如第 1000 页）应改用**游标分页**（cursor）。

### 游标分页（高性能）

```ts
const users = await prisma.user.findMany({
  take: 20,
  cursor: { id: lastId },   // 从这条之后开始
  skip: 1,                  // 跳过 cursor 本身
  orderBy: { id: 'asc' },
});
```

---

## 17.2 过滤：where

### 基础条件

```ts
const users = await prisma.user.findMany({
  where: {
    email: 'a@b.com',              // 等于
    role: { not: 'admin' },        // 不等于
  },
});
```

### 常用操作符

| 操作符 | 含义 | 示例 |
| ---- | ---- | ---- |
| `equals` | 等于 | `{ email: { equals: 'a@b.com' } }` |
| `not` | 不等于 | `{ role: { not: 'admin' } }` |
| `in` | 在列表中 | `{ id: { in: [1, 2, 3] } }` |
| `contains` | 包含（字符串） | `{ nickname: { contains: '张' } }` |
| `startsWith` | 前缀 | `{ email: { startsWith: 'a' } }` |
| `gt` / `gte` | 大于 / 大于等于 | `{ age: { gt: 18 } }` |
| `lt` / `lte` | 小于 / 小于等于 | `{ price: { lte: 100 } }` |
| `AND` / `OR` / `NOT` | 逻辑组合 | `{ OR: [{ ... }, { ... }] }` |

### 组合条件

```ts
const users = await prisma.user.findMany({
  where: {
    AND: [
      { role: 'user' },
      {
        OR: [
          { nickname: { contains: '张' } },
          { email: { contains: 'zhang' } },
        ],
      },
    ],
  },
});
```

> 有索引时 `where` 才快，无索引会全表扫描（见 17.5）。

---

## 17.3 排序：orderBy

```ts
const users = await prisma.user.findMany({
  orderBy: [
    { role: 'asc' },          // 先按角色升序
    { createdAt: 'desc' },    // 再按创建时间降序
  ],
});
```

> 多字段排序按数组顺序依次生效，和 SQL 的 `ORDER BY role ASC, created_at DESC` 一致。

---

## 17.4 聚合：count / groupBy / aggregate

### 计数 count

```ts
const count = await prisma.user.count({
  where: { role: 'admin' },
});
```

### 分组 groupBy

```ts
// 按角色统计用户数
const stats = await prisma.user.groupBy({
  by: ['role'],
  _count: { _all: true },
});
// [{ role: 'admin', _count: { _all: 3 } }, { role: 'user', _count: { _all: 97 } }]
```

### 聚合 aggregate

```ts
// 统计订单总额、平均额
const result = await prisma.order.aggregate({
  _sum: { amount: true },
  _avg: { amount: true },
  _max: { amount: true },
  _min: { amount: true },
});
```

| 聚合函数 | 作用 |
| -------- | ---- |
| `_sum` | 求和 |
| `_avg` | 平均 |
| `_max` | 最大 |
| `_min` | 最小 |
| `_count` | 计数 |

---

## 17.5 索引优化（性能关键）

### 为什么需要索引？

```sql
-- 无索引：全表扫描 100 万行
SELECT * FROM users WHERE email = 'a@b.com';
```

### schema 中定义索引

```prisma
model User {
  id        Int     @id @default(autoincrement())
  email     String  @unique          // 唯一索引
  nickname  String
  role      String  @default("user")

  @@index([role])                    // 普通索引（按角色查）
  @@index([nickname, role])          // 复合索引
}
```

### 索引设计原则

| 原则 | 说明 |
| ---- | ---- |
| 高频查询字段加索引 | `where` / `orderBy` 的字段 |
| 外键加索引 | JOIN 性能 |
| 不要过度索引 | 每个索引都拖慢写入 |
| 复合索引顺序 | 遵循最左前缀原则 |

> ⚠️ **别一上来就狂加索引**。先用 `EXPLAIN ANALYZE` 找到慢查询，再针对性加。

---

## 17.6 软删除

硬删除（`delete`）数据永久丢失，真实业务常需要**软删除**——打标记而非真删。

```prisma
model User {
  id        Int       @id @default(autoincrement())
  email     String    @unique
  deletedAt DateTime?            // null = 未删除，非 null = 已删除
}
```

```ts
// 软删除：不真删，打时间戳
async softDelete(id: number) {
  return this.prisma.user.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

// 查询时自动过滤已删除
findAll() {
  return this.prisma.user.findMany({
    where: { deletedAt: null },
  });
}
```

> Prisma 无内置软删除，需要手动实现。更优雅的做法是用 Prisma 中间件自动过滤（进阶内容）。

---

## 17.7 完整实战：用户 CRUD（阶段四总集成）

把 Day 13~17 学到的全串起来：

```ts
// user.repository.ts —— 数据层
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryUserDto) {
    const { page = 1, limit = 20, keyword, role, sort } = query;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,                      // 软删除过滤
      ...(keyword && {
        OR: [
          { nickname: { contains: keyword } },
          { email: { contains: keyword } },
        ],
      }),
      ...(role && { role }),
    };

    const [list, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: sort ? { [sort]: 'desc' } : { createdAt: 'desc' },
        include: { orders: { take: 5 } },   // 带最近 5 个订单
      }),
      this.prisma.user.count({ where }),
    ]);

    return { list, total, page, limit };
  }
}
```

```ts
// user.service.ts —— 业务层
@Injectable()
export class UserService {
  constructor(private readonly repo: UserRepository) {}

  async create(dto: CreateUserDto) {
    const exists = await this.repo.findByEmail(dto.email);
    if (exists) throw new ConflictException('邮箱已存在');
    return this.repo.create(dto);
  }

  async findOne(id: number) {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }
}
```

```ts
// user.controller.ts —— HTTP 层（串 Day 6/7/10/11/12）
@ApiTags('users')
@Controller({ path: 'users', version: '1' })
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Post()
  @HttpCode(201)
  @Roles(Role.Admin)
  @UseGuards(RolesGuard)
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.userService.softDelete(id);
  }
}
```

> 这个 Controller 集成了：REST 规范（Day 10）、DTO（Day 11）、Swagger（Day 12）、Guard（Day 6）、Pipe（Day 7）、异常（Day 9）、Repository 分层（Day 15）、关系与事务（Day 16）。**阶段四的交付能力 = 一个完整的、规范的数据持久化 API**。

---

## 17.8 自检清单

- [ ] 分页的 `skip`/`take` 和游标分页的区别？深分页该用哪个？
- [ ] `where` 的常用操作符有哪些？`contains` 和 `in` 各用于什么？
- [ ] `groupBy` 和 `aggregate` 的区别？
- [ ] 索引的利与弊？什么时候加索引？
- [ ] 软删除和硬删除的区别？为什么业务常用软删除？
- [ ] 完整 CRUD 的 Controller / Service / Repository 各自负责什么？

---

## 🎓 第四阶段完成：PostgreSQL / Prisma / Repository 分层

| Day | 主题 | 核心产出 |
| --- | ---- | ---- |
| Day 13 | PostgreSQL 基础 | 关系型 vs NoSQL、核心概念、数据类型、范式、Docker、CRUD SQL |
| Day 14 | Prisma 入门 | 三件套、schema 语法、migrate、基本 CRUD |
| Day 15 | NestJS 整合 | PrismaService、@Global、Repository 分层 |
| Day 16 | 关系与事务 | 一对多/多对多/一对一、嵌套操作、事务 |
| Day 17 | 高级查询 | 分页/过滤/排序/聚合、索引、软删除、完整实战 |

**一句话串联**：**PostgreSQL 存数据（Day 13）→ Prisma 操作数据（Day 14）→ NestJS 分层整合（Day 15）→ 关系与事务（Day 16）→ 高级查询实战（Day 17）**。

**下一阶段**：JWT / Passport / RBAC（4 天）——在 Day 4 的登录基础上做深。

---

## 🔗 上下篇

← [Day 16：关系建模与事务](/day16-relations-transaction) ｜ → [Day 18：JWT 认证原理](/day18-jwt-auth)
