# 📕 Day 4：登录实战（JWT / Guard / HttpOnly Cookie）

## 4.1 职责划分（项目结构）

```
AuthController  → 接 HTTP 请求
AuthService    → 注册/登录认证业务
UserService    → 用户数据
JwtAuthGuard   → 身份验证
DTO            → 参数描述与校验
```

> Controller 只接请求、调 Service，别把查库/加密/生成 Token 堆在 Controller。

## 4.2 `providers / exports / imports` 三句话（DI 排错核心）

| 字段          | 含义                                             |
| ----------- | ---------------------------------------------- |
| `providers` | **我有什么**（UserModule 拥有 UserService，交给 Nest 管理） |
| `exports`   | **我愿意给别人什么**（把 UserService 暴露出去）               |
| `imports`   | **我要用谁的能力**（AuthModule 引入 UserModule）          |

> 遇到 `Nest can't resolve dependencies of AuthService` → 依次查：①UserService 注册到 providers？②有 exports？③AuthModule 有 imports UserModule？

## 4.3 DTO + ValidationPipe（把 Day 2 魔法落地）

```ts
export class RegisterDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) @MaxLength(20) password: string;
  @IsString() @MinLength(2) @MaxLength(20) nickname: string;
}
// main.ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

`@IsEmail()` 装饰器记录规则 → ValidationPipe 读 Metadata 执行校验，失败直接 `BadRequestException`，Controller 收不到脏数据。

## 4.4 密码绝不存明文

```ts
const hashed = await bcrypt.hash(dto.password, 10);  // 存 hash
const ok = await bcrypt.compare(dto.password, user.password); // 登录比对
```

## 4.5 JWT 签发

```ts
return this.jwtService.signAsync({ sub: user.id, email: user.email });
```

> **`sub` = subject = 这个 Token 属于谁**（即 userId）。

## 4.6 JWT vs Cookie 不是竞争关系（最重要认知）

- JWT 解决"身份凭证是什么"，Cookie 解决"浏览器怎么保存/发送凭证" → **JWT 放进 Cookie 一起用**。

## 4.7 HttpOnly / Secure / SameSite

| 属性         | 解决什么                                                           |
| ---------- | -------------------------------------------------------------- |
| `httpOnly` | JS 读不到 Token（降 XSS 窃取风险）；浏览器仍自动携带 → 核心价值"降低被 JS 直接窃取"          |
| `secure`   | 仅 HTTPS 发送；开发 `localhost` 通常 `secure: NODE_ENV==='production'` |
| `sameSite` | 跨站时 Cookie 是否发送，防 CSRF；`Strict`(最严) / `Lax` / `None`           |

```ts
response.cookie('access_token', token, { httpOnly: true, secure: true, sameSite: 'lax' });
// 浏览器自动保存，后续请求自动带 Cookie，前端 JS 无需读取
```

> ⚠️ HttpOnly 不解决所有 XSS；安全不是一个属性就能 cover 的。
