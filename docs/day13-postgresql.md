# 📗 Day 13：PostgreSQL 基础与表设计

> 前置回顾：Day 1~12 完成了架构、请求生命周期、REST API 三阶段——但所有数据都是内存里伪造的。本篇开启第四阶段：**让数据真正持久化**。这也是从"会写接口"到"能交付真实产品"的分水岭。

---

## 13.1 为什么需要数据库？

到 Day 12 为止，我们的 Controller 返回的都是硬编码数据或内存数组。问题：

```ts
// 服务重启后数据全丢
const users = [];   // ❌ 存内存里，进程一重启就没了
```

数据库解决三个问题：

| 问题 | 数据库方案 |
| ---- | -------- |
| **数据丢失** | 持久化到磁盘，重启不丢 |
| **并发访问** | 事务 + 锁保证一致性 |
| **查询效率** | 索引 + 优化器，百万级数据秒查 |

---

## 13.2 关系型数据库 vs NoSQL（选型基础）

| 维度 | 关系型（PostgreSQL/MySQL） | NoSQL（MongoDB/Redis） |
| ---- | ---------------------- | ------------------ |
| 数据模型 | 表 + 行 + 列（严格 schema） | 文档 / 键值（灵活） |
| 关系表达 | 外键 JOIN，天然支持 | 弱，靠嵌套或应用层 |
| 一致性 | 强（ACID 事务） | 多数最终一致 |
| 查询能力 | SQL，功能强大 | 各自查询语言 |
| 适用场景 | **业务数据**（用户/订单/支付） | 缓存、日志、非结构化 |

> **本项目结论**：Agent 应用的核心业务数据（用户、会话、工具调用记录）都有明确结构、强关系 → **选关系型数据库**。PostgreSQL 是当前功能最强、生态最好的开源关系型数据库。

### 为什么是 PostgreSQL 而不是 MySQL？

| 对比 | PostgreSQL | MySQL |
| ---- | --------- | ----- |
| 数据类型 | 更丰富（JSON/数组/枚举） | 较基础 |
| JSON 支持 | 一流（`jsonb` 可索引） | 较弱 |
| 事务隔离 | 更严格，默认 READ COMMITTED | 类似 |
| 扩展性 | 自定义类型/函数/插件强 | 相对弱 |
| 生态趋势 | 近年上升最快 | 成熟稳定 |

> NestJS + Prisma 社区**默认首选 PostgreSQL**，本系列全程使用它。

---

## 13.3 核心概念

| 概念 | 类比 | 说明 |
| ---- | ---- | ---- |
| **表 Table** | Excel 工作表 | 一类数据的集合 |
| **行 Row** | 一行记录 | 一个实体实例 |
| **列 Column** | 一列 | 一个属性（有明确类型） |
| **主键 Primary Key** | 身份证号 | 唯一标识一行，不能重复、不能为空 |
| **外键 Foreign Key** | 引用他人身份证 | 指向另一张表的主键，表达关系 |
| **索引 Index** | 目录 | 加速查询，但增删改会变慢 |

```sql
-- 用户表
CREATE TABLE users (
  id         SERIAL PRIMARY KEY,        -- 自增主键
  email      VARCHAR(255) UNIQUE NOT NULL,  -- 唯一约束
  nickname   VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 订单表（含外键）
CREATE TABLE orders (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),  -- 外键指向 users.id
  amount  NUMERIC(10, 2) NOT NULL,
  status  VARCHAR(20) DEFAULT 'pending'
);
```

---

## 13.4 常用数据类型

| 类型 | 说明 | 示例 |
| ---- | ---- | ---- |
| `SERIAL` / `INTEGER` | 自增整数 / 整数 | 主键 id |
| `BIGINT` | 大整数 | 雪花 ID |
| `VARCHAR(n)` | 变长字符串 | 邮箱、昵称 |
| `TEXT` | 长文本 | 文章正文 |
| `BOOLEAN` | 布尔 | `true` / `false` |
| `NUMERIC(p, s)` | 精确小数（金额！） | `NUMERIC(10,2)` |
| `TIMESTAMP` | 时间戳 | `created_at` |
| `DATE` | 日期 | 生日 |
| `JSONB` | JSON 二进制（可索引） | 配置、扩展字段 |
| `UUID` | 通用唯一标识 | 分布式 ID |

> ⚠️ **金额绝不用 FLOAT/DOUBLE**（浮点精度丢失），必须用 `NUMERIC` 或整数分存储。

---

## 13.5 表设计：三大范式（理解即可）

范式是避免数据冗余的规则，**实际项目掌握前两范式 + 适当反范式**：

| 范式 | 核心 | 反例 |
| ---- | ---- | ---- |
| **1NF** | 列不可再分，无重复组 | 一列存 `"篮球,足球"` |
| **2NF** | 非主键完全依赖主键 | 订单表存用户名（用户信息应独立） |
| **3NF** | 消除传递依赖 | 订单表存 `user_id` 又存 `user_email` |

> **实践原则**：范式是指导，不是教条。高频查询场景（如订单快照）可以**故意反范式**（存冗余字段）换取查询性能。别过度设计。

---

## 13.6 Docker 启动 PostgreSQL

这是最省事的本地开发方式（也是阶段六 Docker 的前置铺垫）：

```bash
docker run -d \
  --name nest-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=nestjs_learning \
  -p 5432:5432 \
  postgres:16
```

> 数据会存在容器内，删容器就丢。正式开发加 volume：
> ```bash
> -v pgdata:/var/lib/postgresql/data
> ```

验证连接：

```bash
docker exec -it nest-pg psql -U postgres -d nestjs_learning
```

---

## 13.7 基础 CRUD SQL（面试必会）

```sql
-- 增
INSERT INTO users (email, nickname) VALUES ('a@b.com', '张三');

-- 查（全部 / 条件 / 排序 / 分页）
SELECT * FROM users;
SELECT * FROM users WHERE email = 'a@b.com';
SELECT * FROM users ORDER BY created_at DESC;
SELECT * FROM users LIMIT 20 OFFSET 0;      -- 分页

-- 改
UPDATE users SET nickname = '李四' WHERE id = 1;

-- 删
DELETE FROM users WHERE id = 1;
```

### JOIN 联表查询（关系型数据库的精髓）

```sql
-- 查每个订单所属用户的昵称
SELECT o.id, o.amount, u.nickname
FROM orders o
JOIN users u ON o.user_id = u.id;
```

| JOIN 类型 | 说明 |
| --------- | ---- |
| `INNER JOIN` | 两边都匹配才返回 |
| `LEFT JOIN` | 左表全部保留，右表无匹配填 NULL |
| `RIGHT JOIN` | 右表全部保留 |

---

## 13.8 自检清单

- [ ] 数据库解决哪三个问题？
- [ ] 关系型数据库 vs NoSQL 的核心区别？本项目为什么选 PostgreSQL？
- [ ] 主键、外键、索引分别是什么？各自作用？
- [ ] 金额字段应该用什么类型？为什么不能用 FLOAT？
- [ ] 三大范式分别解决什么问题？什么时候可以反范式？
- [ ] `INNER JOIN` 和 `LEFT JOIN` 的区别？
- [ ] 分页查询用哪个 SQL 子句？

---

## 🔗 上下篇

← [Day 12：Swagger 文档](/day12-swagger) ｜ → [Day 14：Prisma 入门](/day14-prisma-intro)
