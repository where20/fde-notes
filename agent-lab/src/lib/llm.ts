import 'dotenv/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;

if (!apiKey) {
  console.error('❌ 缺少 OPENAI_API_KEY：请先 `cp .env.example .env` 并填入 key');
  process.exit(1);
}

// OpenAI 兼容客户端：改 OPENAI_BASE_URL 即可指向任意兼容端点
export const client = new OpenAI({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});

export const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

// embedding 相关：不同厂商的 embedding 接口并不统一，这里做一层适配
const BASE = (baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
const IS_MINIMAX = /minimax/i.test(BASE);
export const EMBED_MODEL = process.env.EMBEDDING_MODEL ?? (IS_MINIMAX ? 'embo-01' : 'text-embedding-3-small');

/**
 * 流式输出一段对话，逐字打印（打字机效果）。
 * 这是 Agent 应用里 SSE 推送的前置：底层都是 stream: true 逐 chunk 吐字。
 */
export async function streamChat(messages: ChatCompletionMessageParam[]) {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) process.stdout.write(text);
  }
  process.stdout.write('\n');
}

/**
 * 文本向量化（embedding）。不同厂商接口不统一，这里统一成 `number[][]`：
 * - MiniMax：body `{model, texts:[...], type:'db'|'query'}` → 响应 `{vectors:[[...]]}`
 * - OpenAI 标准：body `{model, input:[...]}` → 响应 `{data:[{embedding:[...]}]}`
 *
 * type 说明：MiniMax 区分「文档入库(db)」与「查询(query)」两种向量，
 * 语义检索时文档侧用 db、问题侧用 query；OpenAI 标准忽略该参数。
 */
export async function embed(texts: string[], type: 'db' | 'query' = 'db'): Promise<number[][]> {
  const body = IS_MINIMAX
    ? { model: EMBED_MODEL, texts, type }
    : { model: EMBED_MODEL, input: texts };

  const res = await fetch(`${BASE}/embeddings`, {
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

  // MiniMax
  if (Array.isArray(json.vectors)) return json.vectors;
  // OpenAI 标准
  if (Array.isArray(json.data)) return json.data.map((d) => d.embedding ?? []);

  throw new Error(`无法识别的 embedding 响应：${JSON.stringify(json).slice(0, 300)}`);
}
