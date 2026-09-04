# FDE · 学习 + 实战一体化仓库

> **FDE** = *Frontend Developer → Engineer* —— 一个 Vue/Node 前端转型全栈 + Agent 开发的成长记录。
> 学习笔记沉淀为 VitePress 文档站（`docs/`），配套两个实战项目把 NestJS/Agent 能力跑通。

---

## 📦 三层结构

| 路径 | 类型 | 技术栈 | 入口 |
|---|---|---|---|
| [`docs/`](./docs) | 📘 **学习笔记**（VitePress 站点） | VitePress · Mermaid · TypeScript | [`docs/index.md`](./docs/index.md) |
| [`agent-hub/`](./agent-hub) | 🚀 **实战后端**（NestJS 9 阶段 0→上线） | NestJS · Prisma · Redis · BullMQ · SSE · WebSocket · Docker | [`agent-hub/README.md`](./agent-hub/README.md) |
| [`agent-lab/`](./agent-lab) | 🤖 **Agent 最小示例**（四步跑通） | Node · TypeScript · OpenAI SDK · MCP | [`agent-lab/README.md`](./agent-lab/README.md) |
| `NestJS学习笔记.md` | 📝 顶层汇总稿（68 KB） | Markdown | — |

### 三者关系
- **docs/** 是「理论」—— 35 天 NestJS 笔记 + Agent 开发系列
- **agent-hub/** 是「骨架」—— NestJS 实战，把 docs 里学的九大能力全部落地（认证/RBAC/落库/缓存/队列/SSE/WASM/动态模块/容器化）
- **agent-lab/** 是「智能」—— Node 版 Agent 最小示例（流式 LLM / Function Call / RAG / MCP），主链路跑通后接进 agent-hub 的 `/ai` 模块

---

## 🚀 快速开始

### 1. 文档站（VitePress）
```bash
npm install            # 顶层安装 VitePress
npm run dev            # 本地预览 → http://localhost:5173
npm run build          # 产出 docs/.vitepress/dist/
```

### 2. agent-hub（NestJS 后端）
```bash
cd agent-hub
cp .env.example .env   # ⚠️ 用模板生成本地配置，绝不提交真实 .env
npm install
docker compose up -d db redis   # 起本地 Postgres/Redis
npx prisma migrate dev
npm run start:dev      # → http://localhost:3000
# Swagger UI: http://localhost:3000/api-docs
```

### 3. agent-lab（Agent 示例）
```bash
cd agent-lab
cp .env.example .env   # 配置 OPENAI_API_KEY / BASE_URL / MODEL
npm install
npm run 01             # 流式 LLM
npm run 02             # Function Call
npm run 03             # RAG
npm run 04             # MCP
```

---

## 🔒 敏感信息

`.gitignore` 已严格隔离，**千万不要把这些加进 commit**：

| 文件 | 含什么 |
|---|---|
| `agent-hub/.env` | `DB_PASSWORD` / `JWT_SECRET` / `OPENAI_API_KEY` 等 |
| `agent-lab/.env` | `OPENAI_API_KEY` 等 |

✅ `.env.example` 是占位符模板，**应该提交**（供新人 onboarding）。

⚠️ 历史风险：如果之前不小心 commit 过敏感密钥，请**立刻**：
1. 撤销 token（去对应平台 regenerate）
2. 用 `git filter-repo` 或 BFG 重写历史
3. `git push --force`

---

## 🛠️ CI/CD

| Workflow | 触发 | 作用 |
|---|---|---|
| `.github/workflows/agent-hub-ci.yml` | push / PR 到 main | agent-hub 单元测试 + e2e |
| `.github/workflows/deploy-docs.yml` | push 到 main | 部署 docs/ 到 GitHub Pages |

⚠️ GitHub Pages 首次需要去 **Settings → Pages → Source** 切到 **GitHub Actions**。

---

## 🤝 与 WorkBuddy 的关系

本仓库是「WorkBuddy 工作流」+「一人公司方法论」的产物：
- **WorkBuddy**（AI 工作伙伴）协助整理笔记、跑通代码、踩坑时定位根因
- 一人公司方法论指导「学什么 / 做什么 / 怎么交付」

`.workbuddy/` 目录是 WorkBuddy 的工作数据（memory / skills 缓存），已 gitignore，不入仓。

---

## 📊 项目状态

| 模块 | 进度 |
|---|---|
| NestJS 35 天笔记 | ✅ 已完结（总览 + Day 1~35） |
| agent-hub 9 阶段 | ✅ 全跑通（认证/RBAC/落库/缓存/队列/SSE/WebSocket/动态模块/容器化） |
| agent-hub AI 模块 | ✅ 四要素全接入（流式 LLM / Function Call / RAG / MCP） |
| Agent 开发笔记 | 🚧 第 2 篇已入站（Agent 循环接进 NestJS） |

---

## 📜 协议

个人学习项目，暂无开源协议。
如需参考，请联系作者（GitHub: [@where20](https://github.com/where20)）。