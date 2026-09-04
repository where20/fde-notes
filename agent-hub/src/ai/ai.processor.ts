import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import OpenAI from 'openai';
import { RedisService } from '../redis/redis.service';
import { GenerateJobData, StreamEvent, streamChannel } from './ai.service';
import { McpService } from './mcp.service';
import { retrieve } from './rag';
import { runTool, tools } from './tools';

/** 本地工具名集合：用于区分「本地函数工具」与「MCP 工具」 */
const LOCAL_TOOL_NAMES = new Set(
  tools.filter((t) => t.type === 'function').map((t) => t.function.name),
);

/**
 * AI 任务的 Worker：在后台消费队列里的任务。
 * 注意 @nestjs/bullmq v11 的约定：Processor 类必须 extends WorkerHost，
 * 并实现 `process(job)` 方法（不再用 @Process() 方法装饰器）。
 *
 * 真实链路：调 LLM（stream:true）→ 每产出一个片段就 publish 到 Redis channel
 *          → SSE 侧订阅该 channel 实时转发给前端（打字机效果）。
 * 降级链路：未配置 OPENAI_API_KEY 时走模拟输出 —— 保证 E2E 测试不依赖外部服务、不消耗 token。
 */
@Processor('ai')
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(
    private readonly redis: RedisService,
    private readonly mcp: McpService,
  ) {
    super();

    // 没配 key → client 为 null，process() 自动走模拟分支
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
        })
      : null;

    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  }

  async process(job: Job<GenerateJobData>): Promise<{ text: string }> {
    this.logger.log(`开始处理任务 ${job.id}：${job.data.prompt}`);

    const channel = streamChannel(String(job.id));

    if (!this.client) {
      return this.mockRun(job, channel);
    }

    // RAG 任务：先检索知识库，再带着资料回答
    if (job.data.type === 'rag') {
      return this.ragRun(job, channel);
    }

    try {
      type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;
      const messages: Msg[] = [{ role: 'user', content: job.data.prompt }];

      // 合并「本地函数工具」+「MCP 工具」，一起交给模型挑选
      const allTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        ...tools,
        ...this.mcp.getTools(),
      ];

      let answer = '';

      // Agent 核心循环：模型可能连续调多次工具，直到它能给出最终回答。
      // 每轮：带 tools 发请求 → 看模型要不要调工具 → 要就执行并回填 → 再来一轮。
      // 这里用非流式（而非 stream:true）是为了拿到完整的 tool_calls 字段；
      // 「流式 + 工具循环」需要手动拼接 delta.tool_calls（进阶话题），
      // 教学示例聚焦工具循环本身，最终回答再逐字推 chunk 模拟打字机。
      for (let round = 1; round <= 5; round++) {
        const res = await this.client.chat.completions.create({
          model: this.model,
          messages,
          tools: allTools,
          tool_choice: 'auto',
        });

        const msg = res.choices[0].message;

        // 没有 tool_calls → 模型已经能直接回答，循环结束
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          answer = msg.content ?? '';
          break;
        }

        // 把「模型想调工具」这条 assistant 消息放进上下文（含 tool_calls）
        messages.push(msg as Msg);

        // 逐个执行工具，结果作为 tool 消息回填给模型
        for (const tc of msg.tool_calls) {
          // 只处理 function 类型工具（新版 SDK 的 tool_calls 是联合类型，含 custom）
          if (tc.type !== 'function') continue;
          const name = tc.function.name;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            args = {};
          }

          this.logger.log(`[第${round}轮] 调用工具 ${name}(${JSON.stringify(args)})`);
          // 工具调用过程实时推给前端，让用户看到 Agent「在思考/在调工具」
          await this.publish(channel, { type: 'tool_call', name, args });

          // 本地函数工具走 runTool，MCP 工具走 mcp.callTool
          const result = await this.runToolOrMcp(name, args);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          });
        }
      }

      // 最终回答逐字推 chunk（前端体验与真流式一致）
      const chars = [...answer];
      let lastReported = 0;
      for (let i = 0; i < chars.length; i++) {
        await this.sleep(30);
        await this.publish(channel, { type: 'chunk', text: chars[i] });

        const progress = Math.round(((i + 1) / Math.max(chars.length, 1)) * 100);
        if (progress - lastReported >= 20) {
          await job.updateProgress(progress);
          lastReported = progress;
        }
      }

      await job.updateProgress(100);
      await this.publish(channel, { type: 'done', text: answer });
      this.logger.log(`任务 ${job.id} 完成，共 ${answer.length} 字`);
      return { text: answer };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`任务 ${job.id} 失败：${message}`);
      await this.publish(channel, { type: 'error', message });
      throw error; // 抛出让 BullMQ 标记为 failed，SSE 侧已收到 error 事件
    }
  }

  /**
   * RAG 检索增强问答：检索知识库 → 拼进 system → 流式回答。
   * 复用 tool_call 事件把「检索命中的文档」推给前端，让用户看到 Agent 搜到了什么资料。
   */
  private async ragRun(
    job: Job<GenerateJobData>,
    channel: string,
  ): Promise<{ text: string }> {
    const question = job.data.prompt;

    try {
      const hits = await retrieve(question, 2);

      // 检索结果作为 tool_call 事件推给前端（name='retrieve' 语义是「检索知识库」）
      await this.publish(channel, {
        type: 'tool_call',
        name: 'retrieve',
        args: {
          question,
          hits: hits.map((h) => ({ score: Number(h.score.toFixed(3)), doc: h.doc })),
        },
      });

      const context = hits.map((h) => h.doc).join('\n');
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `你根据下面的资料回答问题；资料里没有的，就直说不知道。\n\n资料：\n${context}`,
        },
        { role: 'user', content: question },
      ];

      // 真流式打字机：stream:true 逐 chunk 吐字
      const stream = await this.client!.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
      });

      let full = '';
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (!text) continue;
        full += text;
        await this.publish(channel, { type: 'chunk', text });
      }

      await job.updateProgress(100);
      await this.publish(channel, { type: 'done', text: full });
      this.logger.log(`RAG 任务 ${job.id} 完成，共 ${full.length} 字`);
      return { text: full };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`RAG 任务 ${job.id} 失败：${message}`);
      await this.publish(channel, { type: 'error', message });
      throw error;
    }
  }

  /**
   * 未配置 key 时的模拟路径：同样逐字推 chunk，
   * 这样即使没有模型凭据，SSE 流式链路本身也能完整验证。
   */
  private async mockRun(job: Job<GenerateJobData>, channel: string) {
    this.logger.warn('未配置 OPENAI_API_KEY，降级为模拟输出');

    const text = `AI 已完成：${job.data.prompt}（模拟回复）`;
    const chars = [...text]; // 展开运算符，避免中文/emoji 被拆成半个字

    let lastReported = 0;
    for (let i = 0; i < chars.length; i++) {
      await this.sleep(80);
      await this.publish(channel, { type: 'chunk', text: chars[i] });

      const progress = Math.round(((i + 1) / chars.length) * 100);
      if (progress - lastReported >= 20) {
        await job.updateProgress(progress);
        lastReported = progress;
      }
    }

    await job.updateProgress(100);
    await this.publish(channel, { type: 'done', text });
    return { text };
  }

  /**
   * 工具分发：本地函数工具走 runTool，MCP 工具走 mcp.callTool。
   * 通过工具名判断归属，让两类工具对模型完全透明（都是 Function Call）。
   */
  private async runToolOrMcp(name: string, args: Record<string, unknown>): Promise<string> {
    if (LOCAL_TOOL_NAMES.has(name)) {
      return runTool(name, args);
    }
    const mcpResult = await this.mcp.callTool(name, args);
    return mcpResult ?? `未知工具：${name}`;
  }

  private async publish(channel: string, event: StreamEvent) {
    await this.redis.publish(channel, JSON.stringify(event));
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
