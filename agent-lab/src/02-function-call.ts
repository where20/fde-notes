import type OpenAI from 'openai';
import { client, MODEL } from './lib/llm.js';
import { tools, runTool } from './lib/tools.js';

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

async function main() {
  const userMsg = process.argv[2] ?? '广州今天天气怎么样？顺便帮我算一下 2 + 3 * 4';
  const messages: Msg[] = [{ role: 'user', content: userMsg }];

  console.log(`👤 你：${userMsg}\n`);

  // Agent 核心循环：模型可能连续调多次工具，直到它能给出最终回答。
  // 每轮：发请求带 tools → 看模型要不要调工具 → 要就执行并回填 → 再来一轮。
  for (let round = 1; round <= 5; round++) {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto', // 让模型自己决定要不要调工具
    });

    const msg = res.choices[0].message;

    // 没有 tool_calls → 模型已经能直接回答，循环结束
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      console.log(`🤖 最终回答：${msg.content}`);
      return;
    }

    // 把「模型想调工具」这条 assistant 消息放进上下文（含 tool_calls）
    messages.push(msg as Msg);

    // 逐个执行工具，结果作为 tool 消息回填给模型
    for (const tc of msg.tool_calls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments || '{}');
      console.log(`🔧 [第${round}轮] 调用 ${name}(${JSON.stringify(args)})`);

      const result = await runTool(name, args);
      console.log(`   ↳ 返回：${result}`);

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      });
    }
    console.log('');
  }

  console.log('⚠️ 达到最大轮数仍未结束');
}

main();
