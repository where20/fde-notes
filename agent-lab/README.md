# agent-lab

Node 版 Agent 最小示例 —— 四步从「会调 LLM」到「能接 MCP 工具」，一个下午跑通。

> 配套 `agent-hub`（NestJS 后端）使用：后端负责「骨架」（认证/RBAC/落库/队列/SSE/部署），本仓库负责「智能」（模型调用 + 工具调用 + RAG + MCP）。技术栈统一在 Node/TS，不另学 Python。

## 为什么是 Node 而不是 Python

做 Agent 应用，语言熟练度 > 生态流行度。你的强项是 Node/TS，`agent-hub` 已是 NestJS，主链路留在 Node 收益最高。Python 只在你「读懂 / 跑通别人的开源实现」时以脚本级出现。

## 四步递进

| 步骤 | 命令 | 讲什么 | 验收 |
| --- | --- | --- | --- |
| 01 | `npm run 01` | 流式 LLM 调用 | 终端看到模型逐字输出 |
| 02 | `npm run 02` | Function Call：`tools` 参数 + `tool_calls` 回填循环 | 模型能查天气 / 算数 |
| 03 | `npm run 03` | RAG：切分 → embedding → 检索 → 带上下文回答 | 模型读你的私域文档回答 |
| 04 | `npm run 04` | MCP 客户端接 stdio 服务端 | 模型通过 MCP 协议调外部工具 |

## 快速开始

```bash
# 1. 装依赖（WorkBuddy 沙箱里请带 NODE_OPTIONS= 清 shim）
NODE_OPTIONS= npm install

# 2. 配置模型端点
cp .env.example .env
#    编辑 .env：填入 OPENAI_API_KEY；用其它兼容服务时改 OPENAI_BASE_URL / OPENAI_MODEL

# 3. 跑
npm run 01
npm run 02 "深圳今天天气怎么样？"
npm run 03 "agent-lab 是做什么的？"
npm run 04 "帮我算 3 + 5"
```

## 目录结构

```
agent-lab/
├── src/
│   ├── 01-hello-llm.ts     # 流式 LLM 调用
│   ├── 02-function-call.ts # Agent 核心：工具调用循环
│   ├── 03-rag.ts           # 最小 RAG（内存余弦检索）
│   ├── 04-mcp.ts           # MCP 客户端 + Function Call 串联
│   ├── lib/
│   │   ├── llm.ts          # 模型封装（client + 流式输出）
│   │   └── tools.ts        # 内置工具定义 + 执行器
│   └── mcp/
│       └── demo-server.ts  # 内置 stdio MCP 服务端（演示用）
└── .env.example
```

## 换成你自己的 MCP 服务

`04-mcp.ts` 里连的是内置 `demo-server`（stdio 传输），**不依赖任何外部服务**。换成你自己的 MCP 服务时，只需改 `StdioClientTransport` 的 `command` / `args`，或改用其它传输类型。核心逻辑（listTools → 转 OpenAI tools 格式 → Agent 循环调 callTool）完全复用。

> 传输类型怎么选：**本地进程用 stdio**；**远端服务用 Streamable HTTP（新标准，端点通常是 `/mcp`）或 SSE（旧）**。不确定就先用 stdio 跑通，再换。

## 选型说明

- **模型底座**：`openai` 官方 Node SDK，直连 Chat Completions，看透 `tools` / `tool_calls` 底层协议
- **RAG 存储**：先内存余弦检索，吃透后再升级 pgvector / 向量库
- **MCP**：`@modelcontextprotocol/sdk` 官方 SDK

## 端点适配（重要）

Chat Completions 各家基本都兼容 OpenAI 协议，**但 embedding 接口并不统一**。`lib/llm.ts` 的 `embed()` 已做适配：

| 厂商 | 请求体 | 响应 | 备注 |
| --- | --- | --- | --- |
| OpenAI 标准 | `{model, input:[...]}` | `{data:[{embedding:[...]}]}` | `type` 参数被忽略 |
| MiniMax | `{model, texts:[...], type:'db'\|'query'}` | `{vectors:[[...]]}` | 区分「文档入库(db)」与「查询(query)」 |

> 只有 `03-rag` 用到 embedding。换端点时若报 `Cannot read properties of undefined (reading '0')`，十有八九是响应格式不是 OpenAI 标准，去 `embed()` 里加一条分支即可。
> `EMBEDDING_MODEL` 留空时按端点自动推断（MiniMax → `embo-01`，其它 → `text-embedding-3-small`）。

## 已知现象（非 bug）

1. **语义检索可能误命中**：问「agent-lab 是做什么的」时，`agent-hub` 那条可能以更高相似度排在前面——两者字面太接近，而 `embo-01` 区分度有限。真实场景靠「更好的 embedding 模型 + 更大文档集 + 重排序(rerank)」解决，这里为了吃透原理先用内存检索。
2. **输出里带 `<think>` 思维链**：MiniMax-M2.7 是推理模型，会把思考过程一并吐出来。属模型特性，不影响结果。
