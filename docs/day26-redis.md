# 📙 Day 26：Redis 缓存

> 前置回顾：Day 24 用 docker-compose 起过 PostgreSQL。本篇进入阶段七第一站——**Redis**。它是 Agent 应用中会话、限流、任务队列的基石，先解决最常见的用途：**缓存**。

---

## 26.1 为什么需要 Redis？

数据库是系统的**瓶颈**：磁盘 I/O 慢、连接数有限、复杂查询耗时。而多数请求查的是**同样的数据**（热门文章、用户信息、字典表）。

| 存储 | 介质 | 速度 | 用途 |
| ---- | ---- | ---- | ---- |
| 数据库（PostgreSQL） | 磁盘 | 慢（ms 级） | 持久化业务数据 |
| **Redis** | 内存 | 快（μs 级） | 缓存、会话、队列 |

> Redis 是**内存数据库**，读写极快。核心价值：**把高频查询从磁盘搬到内存**。

---

## 26.2 Redis 是什么？（五大数据类型）

Redis 是 **Key-Value 内存数据库**，但 value 支持多种结构：

| 类型 | 特点 | 典型场景 |
| ---- | ---- | ---- |
| **String** | 最基础，字符串/数字 | 缓存、计数器、分布式锁 |
| **Hash** | 字段-值对（像小对象） | 购物车、用户属性 |
| **List** | 有序列表（可两端操作） | 消息队列、最新动态 |
| **Set** | 无序集合（去重） | 标签、共同好友、去重 |
| **ZSet** | 有序集合（带分数） | 排行榜、延迟队列 |

> 关键认知：Redis 不是"另一个数据库"，而是**数据结构服务器**——用对结构能极大简化代码。

---

## 26.3 常用命令

```bash
# String
SET user:1 '{"name":"xiaoan"}' EX 3600   # 存 + 设 1 小时过期
GET user:1
DEL user:1
EXPIRE user:1 3600                        # 单独设过期时间
TTL user:1                                # 查剩余过期时间

# Hash
HSET user:1 name xiaoan age 18
HGETALL user:1

# 计数器
INCR page:view:100
GET page:view:100

# 通用
EXISTS user:1
KEYS user:*               # ⚠️ 生产禁用（阻塞）
```

> ⚠️ **`KEYS` 命令生产环境禁用**：会全量遍历，阻塞 Redis。用 `SCAN` 代替。

---

## 26.4 NestJS 整合 Redis

```bash
npm install @nestjs/cache-manager cache-manager redis
```

### 全局注册 CacheModule

```ts
// app.module.ts
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: 'localhost',
      port: 6379,
      ttl: 60,          // 默认过期时间（秒）
    }),
  ],
})
export class AppModule {}
```

### 手动读写缓存

```ts
@Injectable()
export class UserService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async findOne(id: number) {
    const cacheKey = `user:${id}`;

    // 1. 查缓存
    const cached = await this.cache.get<User>(cacheKey);
    if (cached) return cached;

    // 2. 缓存未命中 → 查库
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException();

    // 3. 写入缓存
    await this.cache.set(cacheKey, user, 3600 * 1000);   // 1 小时
    return user;
  }
}
```

### 自动缓存（@CacheInterceptor）

```ts
@Controller('users')
@UseInterceptors(CacheInterceptor)     // 自动缓存 GET 响应
export class UserController {
  @Get(':id')
  findOne(@Param('id') id: string) {}
}
```

> `@CacheInterceptor` 对 GET 请求自动缓存，适合**读多写少**的接口。

---

## 26.5 缓存策略

### Cache-Aside（旁路缓存，最常用）

```
读：先查缓存 → 命中返回 → 未命中查库 → 写缓存 → 返回
写：先更新数据库 → 再删除缓存
```

> **为什么是"删缓存"而不是"更新缓存"**？写入频繁时，更新缓存性价比低；删除后下次读自动回填，且避免并发写导致的脏数据。

### 三种写入策略对比

| 策略 | 写操作 | 一致性 | 适用 |
| ---- | ---- | ---- | ---- |
| **Cache-Aside** | 更新 DB + 删缓存 | 最终一致 | 通用（推荐） |
| Write-Through | 同步更新 DB 和缓存 | 强一致 | 写少、一致性要求高 |
| Write-Behind | 只更缓存，异步刷 DB | 弱 | 高并发写（有丢数据风险） |

---

## 26.6 三大缓存问题（面试高频）

| 问题 | 现象 | 原因 | 解法 |
| ---- | ---- | ---- | ---- |
| **缓存穿透** | 查不存在的 key，每次都打库 | 恶意攻击/无效 id | 布隆过滤器 / 缓存空值 |
| **缓存击穿** | 热点 key 过期瞬间，大量请求打库 | 单个热点 key 失效 | 互斥锁（分布式锁）/ 永不过期 |
| **缓存雪崩** | 大量 key 同时过期，DB 压力骤增 | TTL 设置相同 | TTL 加随机值 / 多级缓存 |

```ts
// 雪崩防护：TTL 加随机抖动
const ttl = 3600 + Math.floor(Math.random() * 300);   // 3600~3900 秒
await this.cache.set(key, data, ttl * 1000);

// 穿透防护：缓存空值
await this.cache.set(key, null, 60 * 1000);   // 空值也缓存（短 TTL）
```

---

## 26.7 自检清单

- [ ] Redis 相比数据库的核心优势？为什么快？
- [ ] 五种数据类型及各自场景？
- [ ] 为什么生产禁用 `KEYS` 命令？
- [ ] Cache-Aside 策略下，写操作为什么是"删缓存"而非"更新缓存"？
- [ ] 缓存穿透、击穿、雪崩的区别和解法？
- [ ] `EXPIRE` 和 `TTL` 的作用？

---

## 🔗 上下篇

← [Day 25：工程化实战整合](/day25-engineering-practice) ｜ → [Day 27：BullMQ 任务队列](/day27-bullmq)
