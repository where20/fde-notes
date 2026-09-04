// E2E 测试专用环境变量 —— 在所有测试文件加载前执行（jest setupFiles）。
// 固定连「独立测试基础设施」（agent-hub-test-db:5543 / agent-hub-test-redis:6381），
// 绝不污染开发/生产数据库。CI 里可通过 E2E_* 环境变量覆盖。
//
// 注意：ConfigModule.forRoot 底层用 dotenv 加载 .env，dotenv 默认 override:false，
// 不会覆盖这里已设置的 process.env，因此测试值优先级更高。

process.env.DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:testpass@localhost:5543/agent_hub_test?schema=public';

process.env.JWT_SECRET =
  process.env.E2E_JWT_SECRET ?? 'e2e-test-secret-not-for-production';

process.env.JWT_EXPIRES_IN = '7d';

process.env.REDIS_HOST = process.env.E2E_REDIS_HOST ?? 'localhost';
process.env.REDIS_PORT = process.env.E2E_REDIS_PORT ?? '6381';

// E2E 不依赖外部 LLM：清空 key 让 AiProcessor 走 mock 降级。
// 注意必须显式赋值（即使空字符串），因为 dotenv override:false 用
// hasOwnProperty 判断 —— 一旦这里占了坑，.env 里的真实 key 就不会覆盖进来。
process.env.OPENAI_API_KEY = '';
