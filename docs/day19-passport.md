# 📙 Day 19：Passport 策略

> 前置回顾：Day 18 搞懂了 JWT 原理（三段式、签名、双 token）。本篇解决"怎么在 NestJS 里优雅地做认证"——引入 **Passport**，把"用户名密码认证"和"JWT 验签"抽象成可插拔的策略。

---

## 19.1 Passport 是什么？

Passport 是 Node.js 生态里**最流行的认证中间件框架**，核心思想一句话：

> **认证方式各不相同（用户名密码 / JWT / OAuth / GitHub…），但流程是统一的——抽成"策略（Strategy）"，需要哪种装哪种。**

```ts
// 换一种认证方式 = 换一个 Strategy，业务代码不变
passport.use(new LocalStrategy(...));   // 用户名密码
passport.use(new JwtStrategy(...));     // JWT 验签
passport.use(new GitHubStrategy(...));  // OAuth 第三方登录
```

NestJS 官方封装了 `@nestjs/passport`，让它和 Nest 的 DI / Guard 体系无缝融合。

---

## 19.2 Strategy：可插拔认证的抽象

一个 Strategy 回答三个问题：

| 问题 | LocalStrategy（登录） | JwtStrategy（访问） |
| ---- | ---- | ---- |
| 从哪拿凭证？ | 用户名 + 密码（body） | Header 里的 `Authorization: Bearer <token>` |
| 怎么验证？ | 查库比对密码 | 验签 token |
| 验证通过返回什么？ | 用户对象 | payload 解析出的用户 |

> 抽成 Strategy 后，Controller 里的登录/受保护接口都用 `@UseGuards(AuthGuard('xxx'))` 一行搞定，认证细节全被封装。

---

## 19.3 安装依赖

```bash
npm install @nestjs/passport @nestjs/jwt passport passport-local passport-jwt
npm install -D @types/passport-local @types/passport-jwt
```

| 包 | 作用 |
| ---- | ---- |
| `@nestjs/passport` | Nest 集成层（`AuthGuard` 桥接） |
| `@nestjs/jwt` | JWT 签/验（封装 jsonwebtoken，可注入） |
| `passport-local` | 用户名密码策略 |
| `passport-jwt` | JWT 策略 |

---

## 19.4 LocalStrategy：用户名密码认证

```ts
// local.strategy.ts
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });   // 默认字段是 username，这里改成 email
  }

  // 验证通过后，返回值会被挂到 request.user 上
  async validate(email: string, password: string) {
    const user = await this.authService.validateUser(email, password);
    if (!user) throw new UnauthorizedException('邮箱或密码错误');
    return user;
  }
}
```

关键点：

- `super({ usernameField: 'email' })`：指定用 body 里的哪个字段当"用户名"
- `validate()` 是策略约定回调：passport 从 body 取出字段，调 `validate`，返回的用户对象会挂到 `req.user`
- 密码校验失败抛 401（统一由 Exception Filter 处理）

---

## 19.5 JwtStrategy：验签 token

```ts
// jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),  // 从 Header 取 token
      ignoreExpiration: false,                                    // 不忽略过期
      secretOrKey: process.env.JWT_SECRET,                       // 验签密钥
    });
  }

  // payload 是验签通过后的 token 内容，返回值挂到 req.user
  async validate(payload: any) {
    return { userId: payload.sub, role: payload.role };
  }
}
```

关键点：

- `ExtractJwt.fromAuthHeaderAsBearerToken()`：从 `Authorization: Bearer <token>` 提取 token
- `secretOrKey`：**必须和签发时用同一个密钥**
- `validate(payload)` 的返回值 = 后续 `req.user` 的内容 → 这里决定了 Controller 里能拿到什么用户信息

> ⚠️ 两个策略的 `validate` 不同：LocalStrategy 的 `validate(email, password)` 是**校验凭证**，JwtStrategy 的 `validate(payload)` 是**解析已验签的 token**（此时身份已可信）。

---

## 19.6 AuthGuard：与策略绑定

`@nestjs/passport` 提供的 `AuthGuard` 通过参数指定用哪个策略：

```ts
import { AuthGuard } from '@nestjs/passport';

// 登录：走 LocalStrategy
@UseGuards(AuthGuard('local'))
@Post('login')
login() {}

// 访问：走 JwtStrategy
@UseGuards(AuthGuard('jwt'))
@Get('profile')
getProfile() {}
```

### 封装成自己的 Guard（更清晰）

```ts
// local-auth.guard.ts
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}

// jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

```ts
@UseGuards(LocalAuthGuard)   // 语义化，比 AuthGuard('local') 更可读
@Post('login')
login() {}
```

> 封装后和 Day 6 的 `JwtAuthGuard extends AuthGuard('jwt')` 完全一致——Day 6 已经见过它了。

---

## 19.7 完整认证模块

### 目录结构

```
src/auth/
├── auth.module.ts
├── auth.service.ts
├── auth.controller.ts
├── local.strategy.ts
├── jwt.strategy.ts
├── local-auth.guard.ts
├── jwt-auth.guard.ts
└── dto/login.dto.ts
```

### AuthService

```ts
// auth.service.ts
@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,   // @nestjs/jwt 注入
  ) {}

  // 被 LocalStrategy 调用：校验凭证
  async validateUser(email: string, password: string) {
    const user = await this.userService.findByEmail(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;   // 返回前剥离密码
      return result;
    }
    return null;                              // 校验失败
  }

  // 签发 token
  async login(user: any) {
    const payload = { sub: user.id, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload, { expiresIn: '15m' }),
    };
  }
}
```

### AuthController

```ts
// auth.controller.ts
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(200)
  async login(@Request() req) {
    // LocalAuthGuard 通过后，req.user 已挂载用户
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;   // JwtStrategy.validate 的返回值
  }
}
```

### AuthModule 组装

```ts
// auth.module.ts
@Module({
  imports: [
    UserModule,                                    // 需要 UserService
    PassportModule,                                // 注册 Passport 能力
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

> `JwtModule.register()` 是**配置 JWT 签发的模块**；`PassportModule` 是**引入 Passport 的模块**。策略（Strategy）要作为 `providers` 注册。

---

## 19.8 登录请求的完整流转

```
POST /auth/login { email, password }
      ↓
LocalAuthGuard（AuthGuard('local')）
      ↓
LocalStrategy.validate(email, password) → AuthService.validateUser 查库比对密码
      ↓ 通过
user 挂到 req.user → Controller.login(req) → AuthService.login 签发 JWT
      ↓
返回 { accessToken }
```

之后每次请求：

```
GET /auth/profile 带 Authorization: Bearer <token>
      ↓
JwtAuthGuard（AuthGuard('jwt')）
      ↓
JwtStrategy.validate(payload) → 验签通过，解析出 { userId, role }
      ↓
req.user 可用 → Controller 返回
```

---

## 19.9 自检清单

- [ ] Passport 的核心思想是什么？Strategy 解决了什么？
- [ ] LocalStrategy 和 JwtStrategy 的 `validate` 分别做什么？有何不同？
- [ ] `AuthGuard('jwt')` 里的 `'jwt'` 指什么？
- [ ] `ExtractJwt.fromAuthHeaderAsBearerToken()` 从哪提取 token？
- [ ] `secretOrKey` 为什么必须和签发密钥一致？
- [ ] 为什么要封装 `JwtAuthGuard extends AuthGuard('jwt')`？
- [ ] `JwtModule.register` 和 `PassportModule` 各干什么？

---

## 🔗 上下篇

← [Day 18：JWT 认证原理](/day18-jwt-auth) ｜ → [Day 20：RBAC 权限控制](/day20-rbac)
