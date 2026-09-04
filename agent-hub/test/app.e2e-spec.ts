import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * agent-hub 端到端测试
 *
 * 覆盖链路：健康检查 → 注册/登录（JWT）→ RBAC 权限 → Redis 缓存/动态模块 → BullMQ 队列。
 * 依赖独立测试基础设施（PostgreSQL:5543 + Redis:6381），见 setup-env.ts。
 */
describe('agent-hub (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let createdId: number;

  // 随机邮箱，避免多次跑测试时唯一约束冲突
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.com`;
  const password = 'e2e-password-123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // 与 src/main.ts 保持完全一致，否则响应格式对不上
    app.useWebSocketAdapter(new IoAdapter(app));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('基础与健康检查', () => {
    it('GET /health 返回 ok', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect(({ body }) => {
          expect(body.code).toBe(0);
          expect(body.data.status).toBe('ok');
        });
    });

    it('GET / 返回 Hello World', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toBe('Hello World!');
        });
    });
  });

  describe('认证链路：注册 → 登录 → JWT', () => {
    it('POST /auth/register 创建用户（响应不含 password）', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201)
        .expect(({ body }) => {
          expect(body.code).toBe(0);
          expect(body.data.email).toBe(email);
          expect(body.data.role).toBe('user');
          expect(body.data.password).toBeUndefined();
          createdId = body.data.id;
        });
    });

    it('POST /auth/register 重复邮箱返回 409', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(409)
        .expect(({ body }) => {
          expect(body.code).toBe(409);
          expect(body.data).toBeNull();
        });
    });

    it('POST /auth/register 密码过短返回 400', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: `short-${Date.now()}@test.com`, password: '123' })
        .expect(400);
    });

    it('POST /auth/login 成功签发 JWT', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.accessToken).toBeDefined();
          expect(body.data.user.email).toBe(email);
          token = body.data.accessToken;
        });
    });

    it('POST /auth/login 密码错误返回 401', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('RBAC 权限控制', () => {
    it('GET /users/profile 无 token 返回 401', () => {
      return request(app.getHttpServer()).get('/users/profile').expect(401);
    });

    it('GET /users/profile 带 token 返回当前用户', () => {
      return request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.email).toBe(email);
          expect(body.data.id).toBe(createdId);
        });
    });

    it('GET /users/admin 普通用户返回 403（RBAC 拦截）', () => {
      return request(app.getHttpServer())
        .get('/users/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('Redis 缓存与动态模块', () => {
    it('GET /redis/demo 返回动态模块写入的值', () => {
      return request(app.getHttpServer())
        .get('/redis/demo')
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.ping).toBe('PONG');
          expect(body.data.value).toBe('hello-from-redis-module');
        });
    });
  });

  describe('BullMQ 队列', () => {
    it('POST /ai/generate 立即返回 jobId', () => {
      return request(app.getHttpServer())
        .post('/ai/generate')
        .send({ prompt: 'e2e test prompt' })
        .expect(201)
        .expect(({ body }) => {
          expect(body.data.jobId).toBeDefined();
        });
    });
  });
});
