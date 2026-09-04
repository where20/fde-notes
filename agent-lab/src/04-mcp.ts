import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type OpenAI from 'openai';
import { client, MODEL } from './lib/llm.js';

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

async function main() {
  const question = process.argv[2] ?? '帮我算 3 + 5';

  // 1. 连一个 MCP 服务端（内置 demo-server，不依赖外部服务；换成你自己的只需改 command/args）
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/mcp/demo-server.ts'],
  });
  const mcp = new Client({ name: 'agent-lab', version: '0.1.0' });
  await mcp.connect(transport);

  // 2. 列出 MCP 提供的工具
  const { tools: mcpTools } = await mcp.listTools();
  console.log('🛠️ MCP 工具：', mcpTools.map((t) => t.name).join(', '), '\n');

  // 3. 把 MCP 工具转成 OpenAI Function Call 的 tools 格式
  const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = mcpTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
    },
  }));

  // 4. Agent 循环：模型决定调哪个 MCP 工具，我们通过 mcp.callTool 执行
  const messages: Msg[] = [{ role: 'user', content: question }];
  console.log(`👤 你：${question}\n`);

  for (let round = 1; round <= 5; round++) {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: openaiTools,
      tool_choice: 'auto',
    });
    const msg = res.choices[0].message;

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      console.log(`🤖 最终回答：${msg.content}`);
      break;
    }

    messages.push(msg as Msg);
    for (const tc of msg.tool_calls) {
      const name = tc.function.name;
      const args = JSON.parse(tc.function.arguments || '{}');
      console.log(`🔧 [第${round}轮] MCP 调用 ${name}(${JSON.stringify(args)})`);

      // 关键差异：工具执行走 MCP 协议 callTool，而非本地函数
      const result = await mcp.callTool({ name, arguments: args });
      const text = (result.content as Array<{ type: string; text?: string }>)
        .map((c) => c.text ?? '')
        .join('');
      console.log(`   ↳ 返回：${text}`);

      messages.push({ role: 'tool', tool_call_id: tc.id, content: text });
    }
    console.log('');
  }

  await mcp.close();
}

main();
