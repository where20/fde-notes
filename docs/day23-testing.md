# 📙 Day 23：测试（单元 + E2E）

> 前置回顾：Day 15 讲过 Repository 分层的三大好处之一就是"单元测试只 mock Repository"。本篇把测试拆透：测试金字塔、`TestingModule`、单元测试、E2E 测试、覆盖率。**没有测试的重构 = 赌博**。

---

## 23.1 为什么要测试？

| 价值 | 说明 |
| ---- | ---- |
| 防回归 | 改了 A 不破坏 B，有测试兜底 |
| 文档 | 测试描述行为，比注释更可信 |
| 重构勇气 | 有测试才敢大胆改结构 |
| 质量底线 | 上线前自动化验证核心逻辑 |

---

## 23.2 测试金字塔

```
       ╱   E2E 测试（少）      ：端到端，真实起服务
      ╱    Integration（中）   ：多个模块联动
     ╱     Unit 测试（多）     ：单个函数/类，隔离依赖
```

| 层级 | 测什么 | 速度 | 数量 |
| ---- | ---- | ---- | ---- |
| **Unit（单元）** | 单个 Service/函数 | 快 | 最多 |
| **Integration（集成）** | 模块间协作 | 中 | 中 |
| **E2E（端到端）** | 完整 HTTP 流程 | 慢 | 少 |

> 原则：**底层多、顶层少**。大量快速单元测试 + 少量关键 E2E 测试。

---

## 23.3 TestingModule（@nestjs/testing）

Nest 官方测试工具，核心是 `Test.createTestingModule()` —— 创建一个隔离的模块，注入 mock 依赖。

```bash
npm install -D @nestjs/testing jest @types/jest ts-jest
```

```ts
import { Test } from '@nestjs/testing';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,           // 替换真实依赖
          useValue: {                        // 用 mock 对象
            findByEmail: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(UserService);
  });
});
```

> `useValue` 是 mock 的核心：真实 `UserRepository` 不查库，换成带 `jest.fn()` 的假对象。

---

## 23.4 单元测试 Service（最常用）

```ts
// user.service.spec.ts
describe('UserService.create', () => {
  it('邮箱已存在时抛 ConflictException', async () => {
    // 1. mock 行为：findByEmail 返回已存在用户
    (userRepository.findByEmail as jest.Mock).mockResolvedValue({ id: 1 });

    // 2. 断言：调用 create 应抛 409
    await expect(
      service.create({ email: 'a@b.com', password: '******' }),
    ).rejects.toThrow(ConflictException);
  });

  it('邮箱不存在时正常创建', async () => {
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
    (userRepository.create as jest.Mock).mockResolvedValue({ id: 2 });

    const result = await service.create({ email: 'new@b.com', password: '******' });

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@b.com' }),
    );
    expect(result.id).toBe(2);
  });
});
```

### jest.fn 核心 API

| API | 作用 |
| ---- | ---- |
| `jest.fn()` | 创建 mock 函数 |
| `mockResolvedValue(x)` | 让 async 返回 x |
| `mockRejectedValue(e)` | 让 async 抛错 e |
| `toHaveBeenCalledWith(...)` | 断言被以某参数调用 |
| `toHaveBeenCalledTimes(n)` | 断言调用次数 |

---

## 23.5 单元测试 Controller

```ts
// user.controller.spec.ts
describe('UserController', () => {
  it('findOne 返回用户', async () => {
    const mockUser = { id: 1, email: 'a@b.com' };
    (userService.findOne as jest.Mock).mockResolvedValue(mockUser);

    const result = await controller.findOne(1);

    expect(result).toEqual(mockUser);
    expect(userService.findOne).toHaveBeenCalledWith(1);
  });
});
```

> Controller 测试要点：**只测"正确调用 Service + 正确返回"**，业务逻辑交给 Service 测试。

---

## 23.6 E2E 测试（端到端）

E2E 测试真实起一个 Nest 应用，用 HTTP 请求走完整流程。

```ts
// test/app.e2e-spec.ts
import * as request from 'supertest';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  it('POST /auth/login 返回 accessToken', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'a@b.com', password: '******' })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
  });

  afterAll(async () => {
    await app.close();
  });
});
```

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  }
}
```

> E2E 测试需要真实数据库，通常用独立的**测试库**（如 `mydb_test`），每次跑之前重置数据。

---

## 23.7 覆盖率

```bash
npm test -- --coverage
```

```json
// package.json 配置阈值
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

| 指标 | 含义 |
| ---- | ---- |
| statements | 语句覆盖 |
| branches | 分支覆盖（if/else 是否都测到） |
| functions | 函数覆盖 |
| lines | 行覆盖 |

> ⚠️ **覆盖率是参考不是目标**：100% 覆盖率 ≠ 没 bug。重点是**关键路径和边界条件**被覆盖，别为了数字写无意义测试。

---

## 23.8 自检清单

- [ ] 测试金字塔三层分别测什么？为什么底层多顶层少？
- [ ] `TestingModule` 和 `useValue` 的作用？
- [ ] 单元测试 Service 时，怎么 mock Repository？
- [ ] `jest.fn()` 的 `mockResolvedValue` 和 `toHaveBeenCalledWith` 作用？
- [ ] Controller 测试的要点是什么？
- [ ] E2E 测试和单元测试的本质区别？
- [ ] 覆盖率是目标吗？为什么？

---

## 🔗 上下篇

← [Day 22：工程化与配置管理](/day22-config-logging) ｜ → [Day 24：Docker 容器化](/day24-docker)
