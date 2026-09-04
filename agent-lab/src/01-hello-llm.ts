import { streamChat } from './lib/llm.js';

// 第一课：最基础的 LLM 调用（流式）。
// 目标：看明白「模型说话」这件事，底层就是一个 messages 数组 + stream 逐字吐。

const prompt = process.argv[2] ?? '用一句话介绍你自己';

console.log('🤖 模型输出：\n');
await streamChat([{ role: 'user', content: prompt }]);
