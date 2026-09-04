# 📗 Day 10：REST API 设计规范

> 前置回顾：Day 5~9 打通了请求生命周期五件套（Middleware / Guard / Pipe / Interceptor / Filter）。本篇是第三阶段的开篇——**接口到底该怎么设计才规范**。对前端转后端的人来说，这是最容易把前端习惯带进来的地方。

---

## 10.1 先纠正一个常见误解

很多人以为 RESTful 就是"用 JSON 传数据"或"URL 好看点"。都不是。

| 常见误解 | 实际情况 |
| ------- | ------ |
| REST = 用 JSON | REST 是**架构风格**，与数据格式无关 |
| REST = URL 好看 | URL 只是表象，核心是**资源抽象** |
| REST 必须严格遵守 | 实际项目多为 **REST-like**（ pragmatic REST），不必教条 |
| REST 和 HTTP 等价 | REST 是一组约束，HTTP 是实现它的主要载体 |

> **一句话定位**：REST 的核心思想是——**把服务端的一切都抽象成"资源"，用统一的 HTTP 方法去操作它**。

---

## 10.2 前端转后端最大的思维陷阱：动作 vs 资源

这是本篇最重要的部分。前端写惯了函数式调用，很容易把接口设计成 RPC 风格：

```
❌ RPC 风格（动作导向 —— 把函数搬进 URL）
POST /api/getUserById     { "id": 1 }
POST /api/createOrder     { ... }
POST /api/deleteArticle   { "id": 9 }
POST /api/updateUserStatus { "id": 1, "status": 0 }

✅ REST 风格（资源导向 —— URL 只有名词，动作交给 HTTP 方法）
GET    /api/users/1
POST   /api/orders
DELETE /api/articles/9
PATCH  /api/users/1       { "status": 0 }
```

**判断口诀**：**URL 里出现动词，通常就是设计错了。**

少数例外（确实无法映射到 CRUD 的动作，如"发送验证码""执行搜索"）才用动词，但要作为子资源：

```
POST /api/users/1/verification-codes/send   # 或降级为
POST /api/verification-codes                # 把"发送"理解为"创建一个验证码资源"
```

---

## 10.3 RESTful 六条核心约束

Roy Fielding 论文里的原始定义，理解即可，重点在后四条：

| 约束            | 含义                          | NestJS 中的体现                    |
| ------------- | --------------------------- | ----------------------------- |
| 客户端-服务器分离     | 前后端职责分离                     | Controller / Service 分层       |
| **无状态**       | 服务端不保存客户端上下文，每个请求自带全部信息     | JWT 而非 Session（Day 4）         |
| 可缓存           | 响应应明确标识是否可缓存                | `Cache-Control` 响应头           |
| **统一接口**      | 用统一的方式操作资源                  | HTTP 方法语义标准化                  |
| 分层系统          | 客户端不知道是否直连最终服务器             | Guard / Interceptor 分层（Day 6/8） |
| 按需代码（可选）      | 服务端可临时扩展客户端能力               | 实践中基本不用                       |

> 对实际开发影响最大的两条是**无状态**和**统一接口**。

---

## 10.4 HTTP 方法语义与幂等性（面试高频）

| 方法       | 语义        | 幂等    | 安全    | 成功状态码           |
| -------- | --------- | ----- | ----- | --------------- |
| `GET`    | 查询资源      | ✅ 是   | ✅ 是   | 200             |
| `POST`   | 创建资源／执行动作 | ❌ 否   | ❌ 否   | **201 Created** |
| `PUT`    | **整体替换**  | ✅ 是   | ❌ 否   | 200 / 204       |
| `PATCH`  | **局部更新**  | ❌ 否\* | ❌ 否   | 200 / 204       |
| `DELETE` | 删除资源      | ✅ 是   | ❌ 否   | 200 / **204**   |
| `HEAD`   | 只取响应头     | ✅ 是   | ✅ 是   | 200             |
| `OPTIONS`| 探测支持的方法   | ✅ 是   | ✅ 是   | 200             |

- **幂等**：同样的请求执行一次和执行 N 次，服务端状态完全一致。
- **安全**：不修改服务端状态。
- `*` PATCH 理论非幂等，但如果实现为"设置固定值"而非"递增"，实际上也是幂等的。

### PUT vs PATCH（最容易混）

```
用户资源：{ "id": 1, "name": "张三", "email": "a@b.com", "age": 20 }

PUT /users/1    { "name": "李四" }
→ 整体替换，未提供的字段被清空
→ 结果：{ "id": 1, "name": "李四", "email": null, "age": null }

PATCH /users/1  { "name": "李四" }
→ 只更新提供的字段
→ 结果：{ "id": 1, "name": "张三→李四", "email": "a@b.com", "age": 20 }
```

> ⚠️ **实践建议**：业务接口**默认用 PATCH** 做更新。PUT 的整体替换语义在真实业务中很危险（漏传字段就丢数据）。

---

## 10.5 状态码：别再一律返回 200 了

这是前端转后端第二个常见坑——把所有结果都塞进 200，再用 `{ code: 0 / -1 }` 表示成败。

| 类别    | 常用状态码                             | 使用场景                              |
| ----- | --------------------------------- | --------------------------------- |
| `2xx` | 200 / **201** / **204**           | 成功 / 创建成功 / 成功但无响应体               |
| `3xx` | 301 / 302 / 304                   | 重定向 / 缓存未修改                       |
| `4xx` | **400** / **401** / **403** / **404** / **409** / **422** | 参数错 / 未认证 / 无权限 / 不存在 / 冲突 / 语义校验失败 |
| `5xx` | 500 / 502 / 503                   | 服务端错误 / 网关错误 / 服务不可用              |

### 高频状态码辨析

| 状态码                              | 含义                            | 典型场景                     |
| -------------------------------- | ----------------------------- | ------------------------ |
| **400** Bad Request              | 请求本身有错（参数格式／缺失）               | ValidationPipe 校验失败      |
| **401** Unauthorized             | **未认证**（不知道你是谁）               | 没带 Token / Token 过期      |
| **403** Forbidden                | **已认证但无权限**（知道你是谁，但不让你做）      | 普通用户访问管理员接口              |
| **404** Not Found                | 资源不存在                         | 查询的用户 id 不存在             |
| **409** Conflict                 | 请求与当前资源状态冲突                    | 注册时邮箱已存在、乐观锁版本冲突         |
| **422** Unprocessable Entity     | 格式正确但**业务语义**不通过               | 余额不足、库存不够                |

> **401 vs 403** 是最经典的辨析题：**401 = 你没带身份证，403 = 你带了身份证但级别不够**。

### NestJS 中的正确用法

```ts
// ❌ 反模式：一律 200 + 自定义 code
@Post()
create(@Body() dto: CreateUserDto) {
  if (await this.userService.emailExists(dto.email)) {
    return { code: -1, message: '邮箱已存在' };   // HTTP 仍是 200！
  }
  return { code: 0, data: user };
}

// ✅ 正确：用异常表达失败，让状态码说话
@Post()
@HttpCode(201)                          // 创建成功返回 201
async create(@Body() dto: CreateUserDto) {
  if (await this.userService.emailExists(dto.email)) {
    throw new ConflictException('邮箱已存在');   // 409
  }
  return this.userService.create(dto);   // 201
}

@Delete(':id')
@HttpCode(204)                          // 删除成功无响应体
remove(@Param('id', ParseIntPipe) id: number) {
  return this.userService.remove(id);    // 204
}
```

> 自定义 `code` 字段可以作为**补充**，但**不能替代** HTTP 状态码。前端、网关、监控、CDN 都依赖标准状态码工作。

---

## 10.6 URL 命名规范

### 五条硬规则

| 规则             | ❌ 反例                        | ✅ 正例                        |
| -------------- | --------------------------- | --------------------------- |
| **用复数名词**      | `/user`、`/getUsers`         | `/users`                    |
| **小写 + 连字符**   | `/userProfiles`、`/user_profiles` | `/user-profiles`       |
| **不出现动词**      | `/users/create`             | `POST /users`               |
| **层级表达从属**     | `/orders?userId=1`          | `/users/1/orders`           |
| **层级不超过两层**    | `/a/1/b/2/c/3`              | 拆为 `/b/2?aId=1` 等           |

### 嵌套资源的表达

```
GET  /users/1/orders        # 用户 1 的所有订单
GET  /users/1/orders/99     # 用户 1 的 99 号订单
POST /users/1/orders        # 给用户 1 创建订单
```

> 层级**最多两层**。超过两层说明资源关系需要重新抽象，否则 URL 会失控且难以维护。

### 非 CRUD 动作的处理

无法映射到 CRUD 的操作，把它**名词化为子资源**：

```
POST /users/1/avatar          # 上传头像（而不是 /users/1/uploadAvatar）
POST /orders/99/payment       # 支付（而不是 /orders/99/pay）
POST /articles/9/like         # 点赞
```

---

## 10.7 查询参数：分页 / 筛选 / 排序 / 字段

这些**不是**资源路径的一部分，统一用 query string：

```
GET /users?page=1&pageSize=20           # 分页
GET /users?role=admin&status=active     # 筛选
GET /users?sort=-createdAt              # 排序（减号=降序）
GET /users?fields=id,name,email         # 字段裁剪
GET /users?keyword=张                    # 模糊搜索
```

### NestJS 实现（串 Day 7 Pipe）

```ts
export class QueryUserDto {
  @IsOptional()
  @Type(() => Number)              // ← query 全是 string，必须转换！
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(['createdAt', '-createdAt', 'name', '-name'])
  sort?: string;
}

@Controller('users')
export class UserController {
  @Get()
  findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }
}
```

> ⚠️ **`@Type(() => Number)` 是必须的**！HTTP query 里的一切都是字符串，`@IsInt()` 不加转换会校验失败。这正是 Day 7 讲的 Pipe「转换 + 校验」双职责。

### 统一响应结构（串 Day 8 Interceptor）

分页接口的返回体要保持一致，建议用 Interceptor 统一包装：

```ts
// 推荐的分页响应结构
{
  "list": [ ... ],
  "total": 137,
  "page": 1,
  "pageSize": 20
}
```

> 让 Day 8 的 `TransformInterceptor` 统一定型，避免每个接口各写各的。

---

## 10.8 API 版本控制

当接口破坏性变更时（改字段名、改返回结构），需要版本化保护老客户端。三种主流方案：

| 方案                    | 示例                                        | 优点                 | 缺点                      |
| --------------------- | ----------------------------------------- | ------------------ | ----------------------- |
| **URL 路径**（最常用）       | `/api/v1/users`                           | 直观、易调试、易灰度         | URL 变长，语义上"资源"被版本号污染    |
| **请求头**               | `Accept: application/vnd.api.v1+json`     | URL 干净，符合 REST 纯正派 | 不直观，浏览器直接访问不便           |
| **查询参数**              | `/api/users?version=1`                    | 最简单               | 容易漏传，缓存不友好              |

### NestJS 中的实现

```ts
// main.ts —— 全局启用 URI 版本控制
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',      // 不指定版本时默认 v1
});

// 控制器级
@Controller({ path: 'users', version: '1' })
export class UsersV1Controller { /* 老版本 */ }

@Controller({ path: 'users', version: '2' })
export class UsersV2Controller { /* 新版本 */ }

// 单接口级
@Get()
@Version('2')
findAllV2() { /* ... */ }
```

访问路径即 `/v1/users`、`/v2/users`。

> **实践建议**：中小项目**不必一开始就加版本号**，等真正出现破坏性变更时再引入。过早版本化会增加维护负担。

---

## 10.9 REST 设计的六个常见反模式

| 反模式                        | 问题                     | 改法                        |
| -------------------------- | ---------------------- | ------------------------- |
| URL 里塞动词                   | 退化成 RPC，接口数量爆炸         | 用 HTTP 方法表达动作             |
| 一律返回 200 + 自定义 code        | 网关/监控/缓存失效             | 用标准状态码                    |
| 用 GET 做写操作                 | GET 应安全且幂等，会被预加载/缓存    | 改用 POST/PATCH/DELETE      |
| 返回数据库实体原始对象                | 泄露密码哈希、内部字段            | 用响应 DTO 控制输出（Day 11）      |
| 分页不设上限                     | `pageSize=999999` 打爆内存 | `@Max(100)` 限制            |
| 嵌套层级过深                     | URL 失控、权限判断复杂          | 控制两层内                     |

---

## 10.10 自检清单

- [ ] REST 的核心思想是什么？URL 里应该出现动词吗？
- [ ] PUT 和 PATCH 的区别？实际项目推荐用哪个？
- [ ] 创建成功和删除成功分别返回什么状态码？为什么不能一律 200？
- [ ] 401 和 403 的区别？
- [ ] 400、409、422 分别适用什么场景？
- [ ] URL 命名有哪些规范？嵌套资源最多几层？
- [ ] HTTP query 里的数字参数为什么要 `@Type(() => Number)`？
- [ ] 幂等性是什么意思？哪些方法是幂等的？

---

## 🔗 上下篇

← [Day 9：Exception Filter 深入](/day9-exception-filter) ｜ → [Day 11：DTO 进阶](/day11-dto-advanced)
