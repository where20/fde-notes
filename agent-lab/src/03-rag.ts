import { embed, streamChat } from './lib/llm.js';

// 第三课：最小 RAG（检索增强生成）。
// 本质：把「资料」切成块 → 每块转成向量 → 问题也转向量 → 找最相近的几块 → 拼进 prompt 让模型"带着资料"回答。
// 解决的核心问题：模型不知道你的私域数据，RAG 把数据"喂"进上下文。
//
// 注意：embedding 接口各家不统一（OpenAI 用 input → data[].embedding，
// MiniMax 用 texts + type:db/query → vectors），适配逻辑封装在 lib/llm.ts 的 embed() 里。

// 模拟「私域知识库」：真实场景换成你的文档，切分后入库
const DOCS = [
  'agent-hub 是一个 NestJS 后端，覆盖认证、RBAC、PostgreSQL、Prisma、Redis、BullMQ、SSE、WebSocket、Docker 部署。',
  'agent-lab 是 Node 版 Agent 最小示例，用四步教 Function Call、RAG、MCP。',
  'MCP（Model Context Protocol）是工具调用的标准协议：客户端连上服务端后 listTools 拿工具、callTool 调用，不必为每个外部服务写专属胶水代码。',
  '竞彩分析系统用 Elo 评级加泊松分布加蒙特卡洛模拟做比赛预测，目标是 NAS 部署。',
];

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

async function main() {
  const question = process.argv[2] ?? 'agent-lab 是做什么的？';
  console.log(`👤 你：${question}\n`);

  // 1. 向量化：文档侧用 db、问题侧用 query（MiniMax 区分二者；OpenAI 标准忽略该参数）
  //    一次请求批量算完所有文档，比逐条调用快得多
  const docVecs = await embed(DOCS, 'db');
  const [qVec] = await embed([question], 'query');

  // 2. 余弦相似度排序取 top2（生产用向量库，这里内存算，先吃透原理）
  const scored = DOCS.map((doc, i) => ({ doc, score: cosine(qVec, docVecs[i]) }));
  const top = scored.sort((a, b) => b.score - a.score).slice(0, 2);

  console.log('📚 命中文档：');
  top.forEach((t) => console.log(`  [${t.score.toFixed(3)}] ${t.doc}`));

  // 3. 拼上下文，让模型「带着资料」回答
  const context = top.map((t) => t.doc).join('\n');
  const messages = [
    {
      role: 'system' as const,
      content: `你根据下面的资料回答问题；资料里没有的，就直说不知道。\n\n资料：\n${context}`,
    },
    { role: 'user' as const, content: question },
  ];

  console.log('\n🤖 回答：');
  await streamChat(messages);
}

main();
