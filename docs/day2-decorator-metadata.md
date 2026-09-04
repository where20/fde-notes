# 📘 Day 2：Decorator 与 Metadata

## 2.1 为什么 NestJS 到处是 `@`？

不是"好看"，是**声明式编程 + 元数据声明**。

- Express（命令式）：先执行 A → 再 B → 再 C
- NestJS（声明式）：这是 GET、路径 `:id`、要 JwtAuthGuard、参数来自 URL → Controller 接近"接口说明书"

## 2.2 Decorator 与 Metadata 的关系（核心）

| 概念            | 角色                  |
| ------------- | ------------------- |
| **Decorator** | 负责**写标签**（声明信息）     |
| **Metadata**  | 负责**保存标签**（描述数据的数据） |

类比：图片像素是数据，文件名/尺寸/修改时间是 Metadata。

## 2.3 手写最小 Metadata（脱离 NestJS 也能懂）

```ts
import 'reflect-metadata';
function Role(role: string) {
  return function (target: Function) {
    Reflect.defineMetadata('role', role, target);
  };
}
@Role('admin') class UserService {}
Reflect.getMetadata('role', UserService); // => 'admin'
```

> ⚠️ **Metadata 本身不会自动执行任何逻辑**，必须有 Guard / Reflector / Scanner 主动读取它。

## 2.4 `@Roles('admin')` + Guard 闭环

```
@Roles('admin') → SetMetadata('roles', ['admin'])
   → RolesGuard → Reflector 读取 roles
   → 判断当前用户角色 → 允许 / 拒绝
```

`@Roles()` 只声明权限信息，**真正判断权限的是 Guard**。

## 2.5 常用装饰器速查（先熟练四组）

**① 结构**
| 装饰器 | 作用 |
|---|---|
| `@Module()` | 定义业务模块 |
| `@Controller()` | 定义 HTTP Controller |
| `@Injectable()` | 声明 Provider / 参与 DI |

**② 路由**
| 装饰器 | 作用 |
|---|---|
| `@Get()` | 查询 |
| `@Post()` | 创建 |
| `@Put()` | 整体替换资源 |
| `@Patch()` | 部分修改（真实 CRUD 更常见） |
| `@Delete()` | 删除 |

**③ 参数**
| 装饰器 | 作用 |
|---|---|
| `@Body()` | Request Body |
| `@Param()` | 路径参数（默认 string，需 `ParseIntPipe` 转 number） |
| `@Query()` | 查询参数（分页/搜索/排序） |
| `@Headers()` | Header |
| `@Ip()` | 客户端 IP |

**④ 请求生命周期**
| 装饰器 | 作用 |
|---|---|
| `@UseGuards()` | JWT / 权限（门卫） |
| `@UsePipes()` | 校验 / 转换 |
| `@UseInterceptors()` | 日志 / 响应处理 |
| `@UseFilters()` | 异常处理 |
| `@SetMetadata()` | 自定义 Metadata |

> 装饰器位置分 Class / Method / Parameter 三级；Class 级对整个 Controller 生效，Method 级只对单个接口生效。

## 2.6 自定义装饰器

```ts
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().user,
);
// 用法：profile(@CurrentUser() user: User) {}
```

**Day 2 自检**：Decorator 是什么？Metadata 是什么？二者关系？Metadata 会自己执行权限吗？`@Get()` 为什么能注册路由？`@Body()` 为什么知道参数来源？
