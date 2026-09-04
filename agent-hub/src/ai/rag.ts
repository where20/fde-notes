/**
 * RAG（检索增强生成）模块。
 * 本质：把「资料」切成块 → 每块转成向量 → 问题也转向量 → 找最相近的几块 → 拼进 prompt 让模型「带着资料」回答。
 * 解决的核心问题：模型不知道你的私域数据，RAG 把数据「喂」进上下文。
 *
 * embedding 接口各家不统一（OpenAI 用 input → data[].embedding，MiniMax 用 texts + type:db/query → vectors），
 * 适配逻辑封装在 embed() 里（从 agent-lab/src/lib/llm.ts 移植）。
 */

// 模拟「私域知识库」：真实场景换成你的文档，切分后入库
export const KNOWLEDGE_DOCS = [
  'agent-hub 是一个 NestJS 后端，覆盖认证、RBAC、PostgreSQL、Prisma、Redis、BullMQ、SSE、WebSocket、Docker 部署。',
  'agent-lab 是 Node 版 Agent 最小示例，用四步教 Function Call、RAG、MCP。',
  'MCP（Model Context Protocol）是工具调用的标准协议：客户端连上服务端后 listTools 拿工具、callTool 调用，不必为每个外部服务写专属胶水代码。',
  '竞彩分析系统用 Elo 评级加泊松分布加蒙特卡洛模拟做比赛预测，目标是 NAS 部署。',
];

// 注意：BASE / IS_MINIMAX / EMBED_MODEL 不能写成模块级常量——
// NestJS 里 ConfigModule.forRoot 在模块实例化时才加载 .env，而模块级代码在 import 时就执行，
// 那时 process.env 还没被注入，会固化成 OpenAI 默认值。所以必须在 embed() 内动态读取。

/**
 * 文本向量化（embedding）。不同厂商接口不统一，这里统一成 `number[][]`：
 * - MiniMax：body `{model, texts:[...], type:'db'|'query'}` → 响应 `{vectors:[[...]]}`
 * - OpenAI 标准：body `{model, input:[...]}` → 响应 `{data:[{embedding:[...]}]}`
 *
 * type 说明：MiniMax 区分「文档入库(db)」与「查询(query)」两种向量，
 * 语义检索时文档侧用 db、问题侧用 query；OpenAI 标准忽略该参数。
 */
export async function embed(texts: string[], type: 'db' | 'query' = 'db'): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('缺少 OPENAI_API_KEY，无法调用 embedding');

  // 每次调用时动态读取，确保拿到 ConfigModule 已注入的 .env 值
  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const isMinimax = /minimax/i.test(base);
  const model =
    process.env.EMBEDDING_MODEL ?? (isMinimax ? 'embo-01' : 'text-embedding-3-small');

  const body = isMinimax
    ? { model, texts, type }
    : { model, input: texts };

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`embedding 请求失败：HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    vectors?: number[][];
    data?: Array<{ embedding?: number[] }>;
  };

  if (Array.isArray(json.vectors)) return json.vectors; // MiniMax
  if (Array.isArray(json.data)) return json.data.map((d) => d.embedding ?? []); // OpenAI

  throw new Error(`无法识别的 embedding 响应：${JSON.stringify(json).slice(0, 300)}`);
}

/** 余弦相似度：两向量夹角越小越接近 1，方向越一致 */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface RetrievalHit {
  doc: string;
  score: number;
}

/**
 * 检索：把问题转向量 → 与知识库每条算余弦相似度 → 取最相近的 topK 条。
 * 生产环境用向量库（pgvector / Milvus / Qdrant），这里内存算，先吃透原理。
 */
export async function retrieve(question: string, topK = 2): Promise<RetrievalHit[]> {
  // 文档侧用 db、问题侧用 query；一次批量算完所有文档，比逐条快
  const docVecs = await embed(KNOWLEDGE_DOCS, 'db');
  const [qVec] = await embed([question], 'query');

  return KNOWLEDGE_DOCS.map((doc, i) => ({ doc, score: cosine(qVec, docVecs[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
