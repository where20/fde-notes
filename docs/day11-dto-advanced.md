# 📘 Day 11：DTO 进阶

> 前置回顾：Day 7 学了 `ValidationPipe` 基础用法（`@IsEmail()`、`@IsString()`、`whitelist`）；Day 10 用 `QueryUserDto` 接分页参数。本篇深入 DTO 的进阶能力：**嵌套校验、类型转换、复用派生、自定义校验器、响应脱敏**。

---

## 11.1 重新认识 DTO

**DTO = Data Transfer Object（数据传输对象）**——不是 NestJS 发明的，是经典分层架构概念。

```ts
export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}
```

为什么必须是 **class 而不是 interface**？

| 写法 | 运行时存在？ | 能否挂装饰器元数据？ | 能否被 ValidationPipe 校验？ |
| ---- | ----- | ---------- | --------------------- |
| `interface` | ❌ 编译后被完全擦除 | ❌ | ❌ |
| `class` | ✅ 保留为构造函数 | ✅ | ✅ |

> **核心原因**：TypeScript 的 `interface` 是纯编译期概念，`ValidationPipe` 在运行时**看不到任何信息**。DTO 要承载元数据，只能用 class。

**DTO 的三个作用**：
1. **校验** — 脏数据进 Controller 前就被拦下（Day 7）
2. **文档** — 配合 Swagger 自动生成接口文档（Day 12）
3. **类型转换** — 把 plain object / query string 转成正确类型

---

## 11.2 入参 DTO vs 出参 DTO（最容易忽略的安全问题）

很多教程只讲"入参 DTO"，直接把数据库实体返回给前端。这是**严重安全漏洞**：

```ts
// ❌ 危险：直接返回实体，密码哈希、盐值全部泄露
@Get(':id')
findOne(@Param('id') id: string) {
  return this.userService.findOne(+id);
  // 响应：{ id:1, email:'a@b.com', passwordHash:'$2b$10$...', salt:'x7f2', ... }
}

// ✅ 正确：用出参 DTO 控制暴露字段
@Get(':id')
async findOne(@Param('id') id: string) {
  const user = await this.userService.findOne(+id);
  return plainToInstance(UserResponseDto, user);   // 只输出安全字段
}
```

### 出参 DTO 写法

```ts
// user-response.dto.ts
import { Expose, Exclude } from 'class-transformer';

@Exclude()                       // ① 默认全部隐藏
export class UserResponseDto {
  @Expose() id: number;          // ② 只显式暴露这些字段
  @Expose() email: string;
  @Expose() nickname: string;
  @Expose() role: string;
  @Expose() createdAt: Date;

  // passwordHash、salt 未 @Expose → 自动剔除
}
```

> **`@Exclude()` 放在类上 + `@Expose()` 放在字段上 = 白名单模式**，比逐个字段 `@Exclude()` 更安全（新增字段不会意外泄露）。

---

## 11.3 嵌套对象与数组校验（最高频的坑）

### 问题：默认不会递归校验嵌套对象

```ts
class AddressDto {
  @IsString() city: string;
  @IsString() street: string;
}

class CreateOrderDto {
  @IsString() orderNo: string;

  address: AddressDto;   // ❌ 只标了类型，ValidationPipe 不会校验内部字段！
}
```

请求 `POST /orders { "orderNo":"A001", "address":{} }` 会**直接通过校验**——因为 `ValidationPipe` 不知道 `address` 应该按 `AddressDto` 的规则校验。

### 解法：`@ValidateNested()` + `@Type()` 必须成对出现

```ts
import { ValidateNested, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsString() productId: string;
  @IsInt() @Min(1) quantity: number;
}

class CreateOrderDto {
  @IsString() orderNo: string;

  // ① 嵌套单个对象
  @ValidateNested()
  @Type(() => AddressDto)              // ← 告诉 class-transformer 转成 AddressDto 实例
  address: AddressDto;

  // ② 嵌套数组
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })      // ← each: true 校验数组每一项
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

### 口诀记忆

```
嵌套对象 = @ValidateNested() + @Type(() => XxxDto)
嵌套数组 = @IsArray() + @ValidateNested({ each: true }) + @Type(() => XxxDto)
```

> ⚠️ **最常见的线上事故来源**：只写了 `@ValidateNested()` 忘了 `@Type()`。此时 `address` 仍是 plain object，校验**静默失效**（不报错，但也不校验）。

---

## 11.4 class-transformer：类型转换与序列化控制

`class-transformer` 负责**转换**，`class-validator` 负责**校验**。两者配套使用。

### ① `@Type()` — 类型转换

```ts
class QueryDto {
  @Type(() => Number)     // "123" → 123
  @IsInt()
  page: number;

  @Type(() => Boolean)    // "true" → true
  @IsBoolean()
  isActive: boolean;

  @Type(() => Date)       // "2026-01-01" → Date 对象
  @IsDate()
  startDate: Date;
}
```

> **为什么必须**：HTTP 的 query / param 全部是字符串。没有 `@Type(() => Number)`，`@IsInt()` 拿到的 `"1"` 是 string，**校验直接失败**。这正是 Day 7 讲的 Pipe「转换 + 校验」双职责。

### ② `@Transform()` — 自定义转换逻辑

```ts
class CreatePostDto {
  @Transform(({ value }) => value?.trim())
  @IsString()
  title: string;                        // "  hello  " → "hello"

  @Transform(({ value }) => value?.toLowerCase())
  @IsEmail()
  email: string;                        // "A@B.COM" → "a@b.com"

  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : value
  )
  @IsArray()
  @IsString({ each: true })
  tags: string[];                       // "a,b,c" → ["a","b","c"]
}
```

### ③ `@Exclude()` / `@Expose()` — 序列化控制

```ts
export class UserResponseDto {
  @Expose() id: number;
  @Expose() email: string;

  @Exclude()
  passwordHash: string;        // ← 序列化时自动剔除

  // 计算字段：把 firstName + lastName 拼成 fullName
  @Expose()
  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

// 使用
const dto = plainToInstance(UserResponseDto, userEntity);
```

### ④ 全局启用序列化

不想每个接口都手动 `plainToInstance`，可全局启用：

```ts
// main.ts
app.useGlobalInterceptors(
  new ClassSerializerInterceptor(app.get(Reflector)),
);
```

> 这样 Controller 直接返回实体也行——但**前提是实体类上写好了 `@Exclude()`**。更推荐显式用出参 DTO，意图更清晰。

---

## 11.5 DTO 复用：四个映射工具类型

NestJS 提供 `@nestjs/mapped-types`（Swagger 项目用 `@nestjs/swagger`）里的映射工具，避免重复写 DTO。

```bash
npm i @nestjs/mapped-types
```

假设基础 DTO：

```ts
class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() @MinLength(2) nickname: string;
  @IsEnum(['user', 'admin']) role: string;
}
```

### ① `PartialType` — 全部字段变可选

```ts
export class UpdateUserDto extends PartialType(CreateUserDto) {}
// 所有字段自动变成 @IsOptional()
```

> **最常用**：`UpdateXxxDto = PartialType(CreateXxxDto)`。配合 REST 规范（Day 10）—— PATCH 就是局部更新，正好对应字段全可选。

### ② `PickType` — 挑选部分字段

```ts
export class LoginDto extends PickType(CreateUserDto, ['email', 'password'] as const) {}
// 只保留 email + password，校验规则一并继承
```

### ③ `OmitType` — 排除部分字段

```ts
export class CreateUserByAdminDto extends OmitType(CreateUserDto, ['password'] as const) {}
// 排除 password（可能由系统生成初始密码）
```

### ④ `IntersectionType` — 合并两个 DTO

```ts
export class CreateUserWithProfileDto extends IntersectionType(
  CreateUserDto,
  UserProfileDto,
) {}
```

### 对比表

| 工具                 | 作用      | 典型场景                                        |
| ------------------ | ------- | ------------------------------------------- |
| `PartialType`      | 全字段转可选  | `UpdateXxxDto`                              |
| `PickType`         | 挑指定字段   | `LoginDto`、`ResetPasswordDto`               |
| `OmitType`         | 排除指定字段  | 去掉敏感/系统生成字段                                 |
| `IntersectionType` | 合并多个 DTO | 复合表单                                        |

> ⚠️ **Swagger 项目（Day 12）必须从 `@nestjs/swagger` 导入这些工具**，而不是 `@nestjs/mapped-types`——否则会丢失 Swagger 文档元数据。

---

## 11.6 自定义校验装饰器

内置装饰器不够用时（手机号、跨字段一致性、业务规则），自己写。

### 示例一：中国大陆手机号

```ts
import {
  registerDecorator, ValidationOptions, ValidationArguments,
} from 'class-validator';

export function IsPhoneNumberCN(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneNumberCN',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && /^1[3-9]\d{9}$/.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} 必须是有效的中国大陆手机号`;
        },
      },
    });
  };
}

// 使用
class CreateUserDto {
  @IsPhoneNumberCN()
  phone: string;
}
```

### 示例二：跨字段校验（确认密码一致）

```ts
import {
  registerDecorator, ValidationOptions, ValidationArguments,
} from 'class-validator';

export function IsConfirmMatch(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isConfirmMatch',
      target: object.constructor,
      propertyName,
      constraints: [property],          // 把关联字段名传进去
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          return value === relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} 必须与 ${args.constraints[0]} 一致`;
        },
      },
    });
  };
}

// 使用
class RegisterDto {
  @IsString() @MinLength(6) password: string;

  @IsConfirmMatch('password', { message: '两次输入的密码不一致' })
  confirmPassword: string;
}
```

> 这完美呼应 Day 2 的核心认知：**装饰器只写元数据，真正执行校验的是 `ValidationPipe`**。自定义装饰器就是往元数据系统里注册一条"验证器规则"。

---

## 11.7 ValidationPipe 完整配置回顾

```ts
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // 剥离 DTO 中未声明的字段
    forbidNonWhitelisted: true,   // 出现未声明字段直接抛 400
    transform: true,              // 自动 plainToInstance（@Type/@Transform 依赖它）
    transformOptions: {
      enableImplicitConversion: false,  // 建议 false，强制显式写 @Type()
    },
  }),
);
```

| 选项                     | 作用                                       | 建议             |
| ---------------------- | ---------------------------------------- | -------------- |
| `whitelist`            | 剥离 DTO 中未声明的字段                           | ✅ 开启           |
| `forbidNonWhitelisted` | 出现未声明字段直接报错（比静默剥离更严格）                     | ✅ 开启（内部系统）     |
| `transform`            | plain object → DTO 实例                    | ✅ **必须开**（否则 `@Type`/`@Exclude` 全部失效） |
| `disableErrorMessages` | 隐藏详细错误信息                                 | 生产环境考虑         |

> ⚠️ `transform: true` 是 `@Type()`、`@Transform()`、`@Exclude()` 生效的**前提**。关掉它，今天学的一半内容都会失效。

---

## 11.8 实战：完整的三层 DTO

```
src/users/dto/
├── create-user.dto.ts      # 入参：创建（字段全必填）
├── update-user.dto.ts      # 入参：更新（PartialType 派生）
├── query-user.dto.ts       # 入参：分页查询（含 @Type 转换）
└── user-response.dto.ts    # 出参：响应脱敏（@Exclude + @Expose）
```

```ts
// create-user.dto.ts
export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @ApiProperty({ minLength: 6 })
  @IsString() @MinLength(6)
  password: string;

  @ApiProperty({ example: '张三' })
  @IsString() @MinLength(2) @MaxLength(20)
  nickname: string;

  @ApiPropertyOptional()
  @IsOptional() @IsPhoneNumberCN()
  phone?: string;
}

// update-user.dto.ts
export class UpdateUserDto extends PartialType(CreateUserDto) {}

// query-user.dto.ts
export class QueryUserDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @IsOptional() @IsString()
  keyword?: string;
}
```

---

## 11.9 自检清单

- [ ] 为什么 DTO 必须用 class 而不是 interface？
- [ ] 为什么不能直接把数据库实体返回给前端？
- [ ] 嵌套对象/数组校验需要哪两个装饰器配合？只写 `@ValidateNested()` 会怎样？
- [ ] `@Type()` 和 `@Transform()` 的区别？
- [ ] `@Exclude()` 在类上 vs 在字段上，语义有什么不同？
- [ ] `PartialType` / `PickType` / `OmitType` / `IntersectionType` 各自适用场景？
- [ ] `transform: true` 关掉会有什么后果？
- [ ] 自定义校验装饰器用哪个 API 注册？`constraints` 用来做什么？

---

## 🔗 上下篇

← [Day 10：REST API 设计规范](/day10-rest-api) ｜ → [Day 12：Swagger 文档](/day12-swagger)
