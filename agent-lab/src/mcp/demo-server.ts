import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 内置演示用 MCP 服务端（stdio 传输）。
// 它被 04-mcp.ts 作为子进程拉起，演示「MCP 客户端 ↔ 服务端」完整链路。

const server = new McpServer({ name: 'agent-lab-demo', version: '0.1.0' });

server.tool('add', '两个数相加', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
}));

server.tool('echo', '原样返回一句话', { text: z.string() }, async ({ text }) => ({
  content: [{ type: 'text', text }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
