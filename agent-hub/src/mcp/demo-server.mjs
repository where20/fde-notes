// MCP 演示服务端（stdio 传输）。
// 注意：这是 .mjs（ESM）——因为 @modelcontextprotocol/sdk 是 ESM-only，
// 而 agent-hub 主工程是 CommonJS，所以演示服务端独立成一个 ESM 文件，
// 由 McpService 用 `node src/mcp/demo-server.mjs` 作为子进程拉起。
// 换真实 MCP 服务只需改 McpService 里的 command/args。

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'agent-hub-demo', version: '0.1.0' });

server.tool('add', '两个数相加', { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: 'text', text: `${a} + ${b} = ${a + b}` }],
}));

server.tool('echo', '原样返回一句话', { text: z.string() }, async ({ text }) => ({
  content: [{ type: 'text', text }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
