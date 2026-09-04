import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type OpenAI from 'openai';
import * as path from 'path';

/**
 * MCP（Model Context Protocol）客户端封装。
 *
 * 关键点：@modelcontextprotocol/sdk 是 ESM-only，而 agent-hub 主工程是 CommonJS，
 * 所以这里用动态 `await import()`（而不是静态 import）加载 SDK——静态 import 会被 tsc
 * 编译成 require，运行时抛 ERR_REQUIRE_ESM。模块名用变量传递，避免 tsc 静态解析 ESM 类型。
 *
 * 职责：连一个 MCP 服务端（内置 demo-server），listTools 拿到工具、callTool 调用工具，
 * 把「MCP 工具」暴露成 OpenAI Function Call 的 tools 格式，供 AiProcessor 使用。
 */
@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

  async onModuleInit() {
    try {
      const CLIENT_MODULE = '@modelcontextprotocol/sdk/client/index.js';
      const STDIO_MODULE = '@modelcontextprotocol/sdk/client/stdio.js';
      const { Client } = (await import(CLIENT_MODULE)) as any;
      const { StdioClientTransport } = (await import(STDIO_MODULE)) as any;

      // 拉起内置 demo-server（.mjs 独立 ESM 文件）；换真实 MCP 服务只需改这里的 command/args
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(process.cwd(), 'src/mcp/demo-server.mjs')],
      });

      const client = new Client({ name: 'agent-hub', version: '0.1.0' });
      await client.connect(transport);
      this.client = client;

      const { tools } = await client.listTools();
      this.tools = tools.map((t: any) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description ?? '',
          parameters:
            (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
        },
      }));

      this.logger.log(`MCP 已连接，工具：${tools.map((t: any) => t.name).join(', ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 连接失败不致命：降级为「无 MCP 工具」，其它能力照常
      this.logger.warn(`MCP 连接失败，本次无 MCP 工具可用：${message}`);
    }
  }

  /** 返回 MCP 工具（转成 OpenAI tools 格式），供 AiProcessor 合并进 Function Call */
  getTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return this.tools;
  }

  /** 通过 MCP 协议调用工具，返回文本结果；未连接时返回 null */
  async callTool(name: string, args: Record<string, unknown>): Promise<string | null> {
    if (!this.client) return null;
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    return content.map((c) => c.text ?? '').join('');
  }

  async onModuleDestroy() {
    await this.client?.close().catch(() => undefined);
  }
}
