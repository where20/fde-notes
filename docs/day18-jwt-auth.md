# 📙 Day 18：JWT 认证原理

> 前置回顾：Day 4 用 `JwtAuthGuard` 做过登录，Day 6 拆透了 Guard + Reflector。本篇进入阶段五，先把 **JWT 到底是什么、为什么用它、它的边界在哪** 讲透——不背库，先懂原理。

---

## 18.1 认证 vs 授权（先分清两个词）

| 概念 | 英文 | 回答的问题 | 通俗说法 |
| ---- | ---- | ---- | ---- |
| **认证** | Authentication | 你是谁？ | 登录（验明正身） |
| **授权** | Authorization | 你能干什么？ | 权限（能进哪个门） |

```ts
// 认证：校验用户名密码 → 确认"你是 xiaoan"
const user = await authService.validateUser(username, password);

// 授权：校验角色 → 判断"xiaoan 能不能删用户"
@Roles(Role.Admin)
@Delete(':id')
remove() {}
```

> 顺序永远是**先认证，后授权**：不知道你是谁，就无从谈你能干什么。JWT 管认证（确认身份），RBAC 管授权（确认权限）。

---

## 18.2 为什么不用 Session？（有状态 vs 无状态）

传统 Session 认证的流程：

```
浏览器 ──登录──▶ 服务器（在内存/Redis 存 session，返回 sessionId）
浏览器 ──带 sessionId──▶ 服务器（查 session 表确认身份）
```

**问题**：服务器要"记住"每个登录用户的会话 → 服务端**有状态**。

- 多台服务器部署时，Session 要共享（存 Redis），增加复杂度
- 服务重启，Session 可能丢
- 前后端分离 / App 场景下，Cookie 机制不便

JWT 的思路是**无状态**：

```
浏览器 ──登录──▶ 服务器（签发一个 token 返回，服务器不存任何东西）
浏览器 ──带 token──▶ 服务器（验签 token，不需要查任何表就能确认身份）
```

> 核心差异一句话：**Session 是"服务器记着你是谁"，JWT 是"你手里拿着服务器盖章的凭证"**。验签即可信，无需查库。

---

## 18.3 JWT 长什么样？（三段式结构）

JWT 是 `Header.Payload.Signature` 三段，用 `.` 连接：

```
xxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyy.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz
└─── Header ───┘└────────── Payload ────────┘└──────── Signature ────────┘
```

三段都是 **Base64Url 编码**的 JSON（不是加密，只是编码）。

| 段 | 内容 | 作用 |
| ---- | ---- | ---- |
| Header | `{ "alg": "HS256", "typ": "JWT" }` | 声明签名算法 |
| Payload | `{ "sub": "1", "role": "admin", "exp": 1710000000 }` | 声明（claims），放用户信息 |
| Signature | 用密钥对前两段算出的签名 | **防篡改**的核心 |

---

## 18.4 三段详解

### Header

```json
{
  "alg": "HS256",   // 签名算法（HMAC-SHA256）
  "typ": "JWT"      // 类型
}
```

### Payload（claims 声明）

```json
{
  "sub": "1",              // subject：用户唯一标识（通常是 id）
  "name": "xiaoan",
  "role": "admin",
  "iat": 1710000000,       // issued at：签发时间
  "exp": 1710003600        // expiration：过期时间（重要！）
}
```

标准声明（Registered Claims）常用三个：

| 声明 | 含义 |
| ---- | ---- |
| `sub` | 主体（用户 id） |
| `iat` | 签发时间 |
| `exp` | 过期时间 |

### Signature（防篡改的关键）

```
Signature = HMACSHA256(
  base64(Header) + "." + base64(Payload),
  secretKey
)
```

> ⚠️ **Payload 是明文可读的（Base64 可解），任何人拿到 token 都能看到里面的内容**——所以**绝不能**把密码、身份证号等敏感信息放进 payload，只能放 `userId`、`role` 这类不敏感信息。

---

## 18.5 签名与验证原理

**签名（签发时）**：服务器用密钥 + 前两段算出签名，拼成完整 token。

**验签（请求时）**：服务器拿到 token，用**同一个密钥**对前两段重算签名，和第三段比对：

- 一致 → token 未被篡改，信任 payload
- 不一致 → 说明被改过，拒绝

```ts
// @nestjs/jwt 封装了签/验，原理如下
import * as jwt from 'jsonwebtoken';

// 签发
const token = jwt.sign(
  { sub: user.id, role: user.role },  // payload
  process.env.JWT_SECRET,              // 密钥
  { expiresIn: '15m' },                // 过期时间
);

// 验证（会抛错如果过期/篡改）
const payload = jwt.verify(token, process.env.JWT_SECRET);
```

### 对称 vs 非对称签名

| 算法 | 密钥 | 特点 | 场景 |
| ---- | ---- | ---- | ---- |
| **HMAC（对称）** | 同一个密钥签+验 | 简单，密钥要保密 | 单体应用（HS256） |
| **RSA/ECDSA（非对称）** | 私钥签、公钥验 | 验签方无需私钥 | 微服务间认证（RS256） |

> 入门用 `HS256` 即可。密钥 `JWT_SECRET` 必须放环境变量，**绝不硬编码、绝不提交 git**。

---

## 18.6 Access Token vs Refresh Token（双 token 设计）

单 token 的困境：token 有效期越长，泄露风险越大；有效期越短，用户体验越差（频繁重登录）。

**双 token 解法**：

| Token | 有效期 | 作用 | 存储 |
| ---- | ---- | ---- | ---- |
| **Access Token** | 短（15min~1h） | 访问接口的凭证 | 内存/变量 |
| **Refresh Token** | 长（7~30 天） | 换取新的 Access Token | 安全存储（HttpOnly Cookie） |

```ts
async login(user) {
  return {
    accessToken: this.jwtService.sign(
      { sub: user.id, role: user.role },
      { expiresIn: '15m' },                    // 短
    ),
    refreshToken: this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '7d' },                      // 长
    ),
  };
}
```

**刷新流程**：

```
Access Token 过期
      ↓
带着 Refresh Token 请求 /auth/refresh
      ↓
服务器验证 Refresh Token 有效 → 签发新的 Access Token
      ↓
客户端用新 Access Token 继续请求
```

> 为什么能"免登录"又安全？Access Token 泄露只影响很短时间；Refresh Token 泄露可以吊销（配合黑名单/版本号）。

---

## 18.7 JWT 的优缺点与安全边界（不要盲目用）

### 优点

- ✅ **无状态**，天然适合分布式/微服务，服务端不用存会话
- ✅ **跨域友好**，适合前后端分离、App
- ✅ **自包含**，payload 自带信息，减少查库

### 缺点

- ❌ **无法主动失效**：token 签发后，在过期前服务器无法单方面"踢下线"（除非额外做黑名单）
- ❌ **体积比 sessionId 大**：每次请求都带完整 token
- ❌ **payload 明文**：不能放敏感信息
- ❌ **密钥泄露 = 全盘沦陷**：任何拿到密钥的人都能伪造 token

### 安全实践清单

| 实践 | 说明 |
| ---- | ---- |
| 密钥放环境变量 | `process.env.JWT_SECRET`，不硬编码 |
| 设置合理过期时间 | Access 短、Refresh 长 |
| 用 HTTPS | 防止 token 在传输中被抓包 |
| 不在 payload 放敏感信息 | 只放 id/role |
| Refresh Token 存 HttpOnly Cookie | 防 XSS 窃取 |
| 关键操作重新验证 | 改密码、转账前可要求二次认证 |

---

## 18.8 自检清单

- [ ] 认证和授权分别回答什么问题？先后顺序？
- [ ] Session 和 JWT 的本质区别？（有状态 vs 无状态）
- [ ] JWT 三段分别是什么？哪段是防篡改的关键？
- [ ] 为什么 payload 里不能放密码？
- [ ] 对称和非对称签名的区别？入门用哪个？
- [ ] 为什么要双 token？Access 和 Refresh 各干什么？
- [ ] JWT 最大的缺点是什么？如何缓解？

---

## 🔗 上下篇

← [Day 17：高级查询与实战](/day17-advanced-query) ｜ → [Day 19：Passport 策略](/day19-passport)
