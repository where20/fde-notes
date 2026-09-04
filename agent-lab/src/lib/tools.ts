import type OpenAI from 'openai';

/**
 * 内置工具定义（OpenAI Function Call 的 tools 参数格式）。
 * 每个工具：name + description + JSON Schema 化的 parameters。
 * 模型就是靠 description 和 parameters 来"看懂"它能调什么、参数长啥样。
 */
export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的实时天气',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名，例如「深圳」' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '计算一个数学表达式',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '数学表达式，例如 "2 + 3 * 4"' },
        },
        required: ['expression'],
      },
    },
  },
];

/**
 * 工具执行器：模型只负责"决定调哪个工具 + 传什么参数"，真正干活的是你这里的代码。
 * 返回的字符串会作为 tool 消息回填给模型，模型据此生成最终回答。
 */
export async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_weather': {
      const city = String(args.city ?? '');
      const temps: Record<string, number> = { 深圳: 30, 北京: 26, 上海: 28 };
      const t = temps[city] ?? 25;
      return `${city} 今天晴，气温 ${t}°C（模拟数据）`;
    }

    case 'calculate': {
      const expression = String(args.expression ?? '');
      // 教学用直接求值；生产环境请用 mathjs 等受控表达式库，避免任意代码执行
      const value = Function(`"use strict"; return (${expression})`)();
      return String(value);
    }

    default:
      return `未知工具：${name}`;
  }
}
