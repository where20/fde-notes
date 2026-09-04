# 📕 Day 12：Swagger 文档

> 前置回顾：Day 10 设计了规范的 REST 接口，Day 11 用 DTO 定义了接口契约。本篇让这些契约**自动变成可视化文档**——前后端协作效率的关键一环，也是第三阶段的收官。

---

## 12.1 为什么需要 Swagger？

没有文档时的协作模式：

```
后端改了字段 → 忘了通知前端 → 前端联调报错 → 来回沟通 → 半天没了
```

| 价值          | 说明                                            |
| ----------- | --------------------------------------------- |
| **契约即文档**   | DTO 写好了文档自动生成，永远不会和代码脱节                       |
| **可交互调试**   | 浏览器里直接发请求，不用开 Postman                         |
| **前端代码生成**  | 用 `openapi-generator` 自动生成 TS 类型和请求函数          |
| **降低沟通成本**  | 字段含义、是否必填、示例值一目了然                              |

> **核心原理**：Swagger 由**装饰器元数据**驱动。这正是 Day 2 讲的——"装饰器只写标签，由框架读取后执行"。所以 Day 11 的 DTO 加上 `@ApiProperty()` 后，文档就能自动生成。

---

## 12.2 安装与配置

```bash
npm i @nestjs/swagger
```

### 基础配置（main.ts）

```ts
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ① 构建文档配置
  const config = new DocumentBuilder()
    .setTitle('NestJS 学习笔记 API')
    .setDescription('前端转 Agent 开发 · 项目接口文档')
    .setVersion('1.0')
    .addTag('users', '用户管理')
    .addTag('auth', '认证登录')
    .addBearerAuth()                    // 启用 JWT Bearer 认证按钮
    .build();

  // ② 生成文档对象
  const document = SwaggerModule.createDocument(app, config);

  // ③ 挂载到 /api-docs
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(3000);
}
bootstrap();
```

启动后访问 `http://localhost:3000/api-docs` 即可看到交互式文档。

### DocumentBuilder 常用方法

| 方法                     | 作用                                    |
| ---------------------- | ------------------------------------- |
| `setTitle()`           | 文档标题                                  |
| `setDescription()`     | 文档描述                                  |
| `setVersion()`         | API 版本                                |
| `addTag(name, desc)`   | 预定义分组标签                               |
| `addBearerAuth()`      | 添加 JWT Bearer 认证（右上角出现 Authorize 按钮）  |
| `addBasicAuth()`       | 添加 Basic 认证                           |
| `addCookieAuth(name)`  | Cookie 认证（配合 Day 4 的 HttpOnly Cookie） |
| `addServer(url, desc)` | 添加服务器地址（多环境切换）                        |
| `setContact()`         | 联系人信息                                 |

---

## 12.3 控制器装饰器

```ts
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('users')                     // 分组
@ApiBearerAuth()                      // 该控制器下接口均需 Bearer Token
@Controller('users')
export class UserController {
  @Get()
  @ApiOperation({
    summary: '查询用户列表',
    description: '支持分页与关键字搜索，最多返回 100 条',
  })
  @ApiResponse({ status: 200, description: '查询成功', type: [UserResponseDto] })
  @ApiResponse({ status: 401, description: '未认证' })
  findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }
}
```

### 常用装饰器速查

| 装饰器                     | 作用                  | 位置           |
| ----------------------- | ------------------- | ------------ |
| `@ApiTags()`            | 接口分组                | Controller 类 |
| `@ApiOperation()`       | 接口描述（summary / description） | 方法    |
| `@ApiResponse()`        | 定义响应（状态码 + 描述 + 类型）  | 方法           |
| `@ApiBearerAuth()`      | 标记需要 Bearer 认证      | 类或方法         |
| `@ApiParam()`           | 描述路径参数              | 方法           |
| `@ApiQuery()`           | 描述查询参数              | 方法           |
| `@ApiBody()`            | 描述请求体               | 方法           |
| `@ApiProperty()`        | 描述 DTO 字段           | DTO 属性       |
| `@ApiPropertyOptional()`| 描述可选 DTO 字段         | DTO 属性       |
| `@ApiExcludeEndpoint()` | 从文档中隐藏该接口           | 方法           |
| `@ApiExtraModels()`     | 注册额外模型（配合 `oneOf`）   | 类            |

---

## 12.4 DTO 与文档联动（核心）

### `@ApiProperty()` — 让字段出现在文档里

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: '邮箱',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '密码',
    example: '123456',
    minLength: 6,
    maxLength: 20,
  })
  @IsString() @MinLength(6) @MaxLength(20)
  password: string;

  @ApiPropertyOptional({ description: '昵称', example: '张三' })
  @IsOptional() @IsString()
  nickname?: string;

  @ApiProperty({ enum: Role, enumName: 'Role', description: '用户角色' })
  @IsEnum(Role)
  role: Role;
}
```

### 常用 `@ApiProperty` 选项

| 选项                          | 作用                    |
| --------------------------- | --------------------- |
| `description`               | 字段说明                  |
| `example`                   | 示例值（文档里直接显示）          |
| `enum` + `enumName`         | 枚举可选值（生成下拉框，且可复用 schema） |
| `default`                   | 默认值                   |
| `minimum` / `maximum`       | 数值范围                  |
| `minLength` / `maxLength`   | 字符串长度                 |
| `type`                      | 明确类型（数组/嵌套对象**必须**）    |
| `isArray`                   | 标记为数组                 |

### 数组与嵌套类型（易错点）

```ts
class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })    // ← 数组必须显式声明 type
  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ type: AddressDto })        // ← 嵌套对象同样需要
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}
```

> ⚠️ **数组和嵌套对象必须用 `type` 显式声明**，否则 Swagger 无法推断结构，文档里会显示成空的 `{}`。

---

## 12.5 枚举处理

```ts
export enum Role {
  User = 'user',
  Admin = 'admin',
}

// 在 DTO 中引用
@ApiProperty({
  enum: Role,
  enumName: 'Role',     // ← 生成可复用的 schema
  example: Role.User,
})
@IsEnum(Role)
role: Role;
```

> 加 `enumName` 后，Swagger 会生成独立的 `Role` schema，前端代码生成器能识别出真正的枚举类型，而不是一堆字符串字面量。

### CLI 插件：自动推断（省去大量手写）

NestJS 提供 CLI 插件，能自动从 TypeScript 类型推断 `@ApiProperty`，大幅减少样板代码：

```json
// nest-cli.json
{
  "compilerOptions": {
    "plugins": ["@nestjs/swagger"]
  }
}
```

开启后，DTO 里不写 `@ApiProperty()` 也能生成基本文档（类型、是否可选自动推断）。需要 `example`、`description` 等细节时再手动补。

---

## 12.6 与 ValidationPipe 的配合（职责分清）

**Swagger 的 `minLength`、`maximum` 只是文档展示，不会真的校验**。真正的校验仍由 Day 7 的 `ValidationPipe` 负责。

```ts
export class CreateUserDto {
  @ApiProperty({ minLength: 6, maxLength: 20 })   // ← 只生成文档
  @IsString()
  @MinLength(6)                                    // ← 真正执行校验
  @MaxLength(20)
  password: string;
}
```

> ⚠️ **两套装饰器职责完全不同**：`@ApiProperty()` 生成文档，`class-validator` 执行校验。两者要同步维护，否则**文档说最少 6 位，实际只校验了 4 位**——这种不一致会坑死前端。

---

## 12.7 生产环境安全

Swagger 暴露了所有接口结构，生产环境必须保护。

### 方案一：仅非生产环境启用（最简单）

```ts
if (process.env.NODE_ENV !== 'production') {
  const config = new DocumentBuilder()/* ... */.build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
}
```

### 方案二：加访问密码（Basic Auth）

```bash
npm i express-basic-auth
```

```ts
import * as basicAuth from 'express-basic-auth';

app.use(
  ['/api-docs', '/api-docs-json'],
  basicAuth({
    challenge: true,
    users: { admin: 'supersecret' },
  }),
);

SwaggerModule.setup('api-docs', app, document);
```

### 方案三：隐藏敏感接口

```ts
@ApiExcludeEndpoint()      // 该接口不出现在文档中
@Post('internal/sync')
internalSync() { /* 内部同步接口，不对外暴露 */ }
```

---

## 12.8 常见坑

| 问题                           | 原因                                   | 解法                                       |
| ---------------------------- | ------------------------------------ | ---------------------------------------- |
| 数组/嵌套字段文档里显示为空 `{}`          | Swagger 无法推断复杂类型                     | 用 `@ApiProperty({ type: [XxxDto] })`      |
| 字段完全没出现在文档里                  | 没加 `@ApiProperty()`                   | 给 DTO 字段加装饰器，或启用 CLI 插件                  |
| `PartialType` 后文档元数据丢失      | 从 `@nestjs/mapped-types` 导入            | **改用 `@nestjs/swagger` 的同名工具**（保留元数据）    |
| 枚举在文档里显示成数字/丢失              | 没用 `enumName`                        | 加 `enum: Role, enumName: 'Role'`         |
| 文档有约束但校验不生效                  | 只写了 `@ApiProperty` 没写 `class-validator` | 补上 `@IsString()` 等校验装饰器                 |
| `@Exclude()` 字段仍出现在文档        | Swagger 不读 class-transformer 的元数据     | 用 `@ApiProperty({ required: false })` 或在出参 DTO 里就不声明该字段 |

> **`PartialType` 的正确导入**（Day 11 埋的伏笔在这里揭晓）：
> ```ts
> // ❌ 丢失 Swagger 元数据
> import { PartialType } from '@nestjs/mapped-types';
> // ✅ 保留 Swagger 元数据
> import { PartialType } from '@nestjs/swagger';
> ```

---

## 12.9 自检清单

- [ ] Swagger 文档是由什么驱动的？（提示：Day 2 的概念）
- [ ] `DocumentBuilder` 和 `SwaggerModule` 各自负责什么？
- [ ] 数组和嵌套对象在 `@ApiProperty` 里要怎么写？
- [ ] `@ApiProperty()` 和 `class-validator` 装饰器的职责区别？
- [ ] `PartialType` 应该从哪个包导入？为什么？
- [ ] `enumName` 的作用是什么？
- [ ] 生产环境有哪三种保护 Swagger 的方案？
- [ ] `@ApiExcludeEndpoint()` 的作用？

---

## 🎓 第三阶段完成：REST API / DTO / Swagger

| Day     | 主题            | 核心产出                                                              |
| ------- | ------------- | ----------------------------------------------------------------- |
| Day 10  | REST API 设计规范 | 资源导向 vs 动作导向、HTTP 方法语义与幂等性、状态码、URL 命名、版本控制、分页                    |
| Day 11  | DTO 进阶        | 入参/出参分离、嵌套校验、`@Type`/`@Transform`/`@Exclude`、四个复用工具、自定义校验器         |
| Day 12  | Swagger 文档    | `DocumentBuilder`、装饰器体系、DTO 联动、枚举处理、生产环境保护、CLI 插件                 |

**一句话串联**：**用 DTO 定义契约（Day 11）→ 按 REST 规范暴露接口（Day 10）→ 自动生成文档（Day 12）**。

> 至此，你已经能独立设计出**规范、可校验、有文档**的完整 REST API。这是后端开发的核心交付能力。

**下一阶段**：PostgreSQL / Prisma / Repository 分层（5 天）

---

## 🔗 上下篇

← [Day 11：DTO 进阶](/day11-dto-advanced) ｜ → [总览 · 35 天路线](/)
