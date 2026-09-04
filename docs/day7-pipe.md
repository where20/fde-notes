# 📗 Day 7：Pipe 深入

> 前置回顾：Day 2 知道 Pipe 负责"校验 + 转换"；Day 3 明确它在 Guard 之后、Controller 之前；Day 4 用过全局 `ValidationPipe`。本篇拆透 Pipe 的两大职责、内置 Pipe、以及如何自定义。

---

## 7.1 Pipe 是什么？两大职责

Pipe 是**处理输入数据**的组件，只做两件事：

1. **转换（Transformation）**：把输入转成期望类型（`"100"` → `100`）
2. **校验（Validation）**：数据不合法就抛异常，Controller 收不到脏数据

```ts
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) {
  // id 已经是 number，不是 string
}
```

> Pipe 在 **Guard 之后、Controller 之前**执行。Guard 里拿到的还是原始未转换的值。

---

## 7.2 执行时机与异常

```
Guard 通过 → Pipe 转换/校验 → Controller
                ↓ 校验失败
         抛 BadRequestException(400) → Exception Filter
```

**关键**：Pipe 抛异常后，Controller **根本不会执行**。这就是"Controller 收不到脏数据"的原因。

---

## 7.3 内置 Pipe 速查

NestJS 开箱提供 9 个 Pipe：

| Pipe | 作用 |
|---|---|
| `ValidationPipe` | 基于 class-validator 校验 DTO（最常用） |
| `ParseIntPipe` | 转整数，失败抛 400 |
| `ParseFloatPipe` | 转浮点数 |
| `ParseBoolPipe` | 转布尔（`'true'` → `true`） |
| `ParseArrayPipe` | 转数组（`'1,2,3'` → `[1,2,3]`） |
| `ParseUUIDPipe` | 校验并转 UUID |
| `ParseEnumPipe` | 校验枚举值 |
| `ParseDatePipe` | 转日期 |
| `DefaultValuePipe` | 提供默认值 |

### 用法示例

```ts
// 转整数
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) {}

// 带默认值 + 转整数
@Get()
findAll(
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
) {}

// 校验 UUID
@Get(':uuid')
find(@Param('uuid', ParseUUIDPipe) uuid: string) {}

// 自定义错误状态码
@Get(':id')
find(@Param('id', new ParseIntPipe({ errorHttpStatusCode: 404 })) id: number) {}
```

> 注意：**带参数要用 `new` 实例**（`new ParseIntPipe({...})`），不带参数直接传类（`ParseIntPipe`）。

---

## 7.4 ValidationPipe（重点）

### 启用方式

```ts
// 全局（推荐）—— main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,        // 剥离 DTO 中未声明的字段
    forbidNonWhitelisted: true, // 有多余字段直接报错（配合 whitelist）
    transform: true,        // 自动转换为 DTO 实例
    transformOptions: { enableImplicitConversion: true },
  }),
);

// 局部
@Post()
create(@Body(ValidationPipe) dto: CreateUserDto) {}
```

### 核心选项

| 选项 | 作用 |
|---|---|
| `whitelist` | 剥离未在 DTO 中声明的字段（防多余字段入库） |
| `forbidNonWhitelisted` | 发现多余字段直接抛 400（比静默剥离更严格） |
| `transform` | 把 plain object 转成 DTO 类实例 |
| `disableErrorMessages` | 隐藏详细错误信息（生产环境） |
| `errorHttpStatusCode` | 自定义错误码 |

### DTO 写法（串 Day 4）

```ts
export class CreateUserDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;

  @IsOptional()          // 可选字段
  @IsInt()
  @Min(0)
  age?: number;
}
```

> `class-validator` 装饰器**记录规则** → `ValidationPipe` **读取 Metadata 并执行校验**。这正是 Day 2"Metadata 不会自动执行，需要有人读取"的落地。

---

## 7.5 自定义 Pipe

实现 `PipeTransform` 接口：

```ts
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string, metadata: ArgumentMetadata): number {
    const val = parseInt(value, 10);
    if (isNaN(val)) {
      throw new BadRequestException(`${metadata.data} 必须是数字`);
    }
    if (val <= 0) {
      throw new BadRequestException(`${metadata.data} 必须为正整数`);
    }
    return val;
  }
}
```

### 第二个参数 `ArgumentMetadata`

```ts
{
  type: 'body' | 'query' | 'param' | 'custom';
  metatype?: Type;      // 声明的类型（如 String、CreateUserDto）
  data?: string;        // 装饰器传的参数名（如 'id'）
}
```

> `metadata.data` 就是错误信息里能显示是哪个字段出错的关键。

---

## 7.6 类校验 Pipe（Schema-based）

用 Joi 做 schema 校验：

```ts
@Injectable()
export class JoiValidationPipe implements PipeTransform {
  constructor(private schema: ObjectSchema) {}

  transform(value: any, metadata: ArgumentMetadata) {
    const { error } = this.schema.validate(value);
    if (error) {
      throw new BadRequestException(error.message);
    }
    return value;
  }
}

// 使用
@Post()
create(@Body(new JoiValidationPipe(createUserSchema)) body: any) {}
```

> 选型建议：**用 class-validator + DTO**（NestJS 主流，与 TS 类型系统结合更好）；Joi 适合 Node 老项目迁移。

---

## 7.7 三个作用域

| 级别 | 写法 | 适用场景 |
|---|---|---|
| 参数级 | `@Param('id', ParseIntPipe) id` | 单个参数转换 |
| 方法级 | `@UsePipes(ValidationPipe)` | 单个接口 |
| 控制器级 | `@UsePipes() class XxxController` | 整个 Controller |
| 全局 | `app.useGlobalPipes(new ValidationPipe())` | 全站统一校验 |

> 和 Guard 一样，全局 Pipe 若需依赖注入，要用 `APP_PIPE` token 注册 provider。

---

## 7.8 注意事项

- **Pipe 在 Guard 之后** → 别在 Guard 里假设参数已被转换
- **`ParseIntPipe` 对 `undefined` 不报错** → 需要默认值请配合 `DefaultValuePipe`
- **`transform: true` 有性能开销** → 高频接口可考虑关闭，只用 `whitelist`
- **全局 ValidationPipe 不会影响 `@Param` 的 string 类型** → 仍需显式加 `ParseIntPipe`

---

**Day 7 自检**：Pipe 的两大职责？`whitelist` 和 `forbidNonWhitelisted` 区别？Pipe 校验失败后 Controller 会执行吗？`ArgumentMetadata` 有哪三个字段？自定义 Pipe 要实现哪个接口？Pipe 和 Guard 的执行顺序？

---

## 🔗 上下篇

← [Day 6：Guard 深入](/day6-guard) ｜ → [Day 8：Interceptor 深入](/day8-interceptor)
