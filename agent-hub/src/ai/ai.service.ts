import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface GenerateJobData {
  prompt: string;
  /** 任务类型：chat = 普通对话（含 Function Call），rag = 检索增强问答 */
  type?: 'chat' | 'rag';
}

export interface JobInfo {
  jobId: string;
  state: string;
  progress: number;
  result?: unknown;
}

/**
 * 每个任务的流式输出频道：Worker 往里 publish，SSE 从这里 subscribe。
 * 用 Redis pub/sub 而非轮询 job 状态，才能真正做到「模型吐一个字、前端显示一个字」。
 */
export const streamChannel = (jobId: string) => `ai:stream:${jobId}`;

/** SSE 推给前端的事件（前端按 type 分别处理） */
export type StreamEvent =
  | { type: 'chunk'; text: string }
  | { type: 'progress'; progress: number }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string }
  | { type: 'not_found' };

@Injectable()
export class AiService {
  constructor(
    @InjectQueue('ai') private readonly aiQueue: Queue<GenerateJobData>,
  ) {}

  /**
   * 提交一个"AI 生成"任务：把慢活丢进队列，立即返回 jobId（不阻塞请求）。
   * Agent 应用里这里就是"用户发消息 → 秒回已受理 → 后台 LLM 跑"的核心。
   */
  async generate(prompt: string): Promise<{ jobId: string }> {
    const job = await this.aiQueue.add('generate', { prompt });
    return { jobId: job.id as string };
  }

  /** 提交一个「检索增强问答」任务：先检索知识库，再带着资料回答 */
  async rag(question: string): Promise<{ jobId: string }> {
    const job = await this.aiQueue.add('rag', { prompt: question, type: 'rag' });
    return { jobId: job.id as string };
  }

  /** SSE 轮询用：读任务当前状态与进度（进度由 Worker 写进 Redis） */
  async getJob(jobId: string): Promise<JobInfo | null> {
    const job = await this.aiQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress =
      typeof job.progress === 'number' ? job.progress : 0;
    const result = state === 'completed' ? job.returnvalue : undefined;

    return { jobId, state, progress, result };
  }
}
