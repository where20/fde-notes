# 📙 Day 24：Docker 容器化

> 前置回顾：Day 13 用 Docker 起过 PostgreSQL，Day 22 讲配置管理。本篇把整个 NestJS 应用容器化——**Dockerfile 多阶段构建 + docker-compose 编排**，让应用"一次构建，到处运行"。

---

## 24.1 为什么需要 Docker？

经典问题："我本地能跑，服务器上为什么不行？"

| 痛点 | Docker 解法 |
| ---- | ---- |
| 环境不一致（Node 版本、系统库） | 镜像固化环境 |
| 依赖安装混乱 | 镜像内锁定版本 |
| 部署繁琐 | 一条命令拉起全套 |
| 团队协作难 | 相同的镜像，相同的结果 |

> 核心价值：**环境一致性**。镜像 = 代码 + 运行时 + 依赖的完整快照。

---

## 24.2 Dockerfile 多阶段构建

多阶段构建的核心：**构建阶段用完整环境（装依赖、编译），运行阶段只留产物**，大幅减小镜像体积。

```dockerfile
# ── 阶段 1：构建（build）──
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci                      # 安装依赖（锁定版本）

COPY . .
RUN npx prisma generate         # 生成 Prisma Client
RUN npm run build               # 编译 TS → JS

# ── 阶段 2：运行（production）──
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production    # 只装生产依赖

COPY --from=build /app/dist ./dist          # 拷贝编译产物
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### 关键点

| 指令 | 作用 |
| ---- | ---- |
| `FROM node:20-alpine AS build` | 基础镜像（alpine 轻量） |
| `npm ci` | 按 lock 文件精确安装（比 `npm install` 稳） |
| `COPY --from=build` | 从构建阶段拷贝产物 |
| `EXPOSE` | 声明端口 |
| `CMD` | 启动命令 |

> **为什么用 `node:20-alpine`**：alpine 是精简版 Linux，体积小（~50MB vs ~1GB），适合生产。

---

## 24.3 .dockerignore（减小构建上下文）

像 `.gitignore` 一样，排除不该进镜像的文件：

```
node_modules
dist
.env
.git
*.md
.gitignore
.dockerignore
```

> 不加 `.dockerignore`，`COPY . .` 会把本地的 `node_modules`、`.env` 全打包进构建上下文，又慢又危险（`.env` 泄露）。

---

## 24.4 docker-compose 编排（应用 + 数据库）

一个后端通常不止一个服务（app + PostgreSQL + Redis），compose 一条命令全部拉起。

```yaml
# docker-compose.yml
version: '3.9'

services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}     # 从 .env 读
      POSTGRES_DB: mydb
    volumes:
      - db-data:/var/lib/postgresql/data    # 持久化数据
    healthcheck:                            # 健康检查
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .                               # 用当前目录 Dockerfile 构建
    ports:
      - '3000:3000'
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@db:5432/mydb
    depends_on:
      db:
        condition: service_healthy          # 等 db 健康后再启动
    restart: unless-stopped

volumes:
  db-data:
```

### 关键点

| 配置 | 作用 |
| ---- | ---- |
| `depends_on.condition: service_healthy` | 等数据库**真正就绪**再启动 app（而不是容器刚起） |
| `volumes` | 数据持久化，容器删了数据还在 |
| `healthcheck` | 容器健康状态探测 |
| `restart: unless-stopped` | 异常退出自动重启 |

> ⚠️ 容器内访问数据库用**服务名**（`db`），不是 `localhost`——compose 会自动建网络。

---

## 24.5 健康检查（healthcheck）

Docker 通过健康检查判断容器是否"活且可用"：

```dockerfile
# Dockerfile 内
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/health || exit 1
```

```ts
// Nest 提供健康检查端点
@Get('health')
health() {
  return { status: 'ok', uptime: process.uptime() };
}
```

> 健康检查让编排系统（compose/K8s）知道"这个容器能不能接流量"，挂了能自动重启/摘除。

---

## 24.6 环境变量注入（串 Day 22）

容器环境变量两种来源：

```yaml
# ① 直接写（适合非敏感）
environment:
  NODE_ENV: production

# ② 从 .env 读（适合敏感，如密码）
environment:
  DB_PASSWORD: ${DB_PASSWORD}
```

```bash
# 用 env_file 注入
env_file:
  - .env
```

> 敏感配置（数据库密码、JWT 密钥）通过环境变量注入，**不写死在镜像/Dockerfile**（会进镜像历史层，泄露）。

---

## 24.7 常用命令

```bash
docker build -t my-app .                 # 构建镜像
docker run -p 3000:3000 my-app           # 单容器运行
docker compose up -d                     # 后台拉起全套
docker compose down                      # 停止并删除容器
docker compose logs -f app               # 跟踪日志
docker compose exec app sh               # 进入容器调试
```

---

## 24.8 自检清单

- [ ] Docker 解决的核心问题是什么？
- [ ] 多阶段构建为什么能减小镜像？`COPY --from` 作用？
- [ ] `npm ci` 和 `npm install` 区别？
- [ ] `.dockerignore` 为什么重要？至少排除哪些？
- [ ] `depends_on: condition: service_healthy` 解决什么问题？
- [ ] 容器内访问数据库为什么用服务名而非 localhost？
- [ ] 敏感配置为什么不能写进 Dockerfile？

---

## 🔗 上下篇

← [Day 23：测试（单元 + E2E）](/day23-testing) ｜ → [Day 25：工程化实战整合](/day25-engineering-practice)
