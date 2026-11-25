import type { SessionMessageInfo, TokenUsageInfo } from '@opencode/client';

/** block 的时间与归属信息，供轨迹视图使用；对话渲染不依赖它。 */
export type BlockMeta = {
  at?: number;
  end?: number;
  messageID?: string;
};

export type Block =
  | {
      id: string;
      kind: 'user';
      text: string;
      skills?: SkillTag[];
      files?: string[];
      meta?: BlockMeta;
    }
  | { id: string; kind: 'text'; text: string; meta?: BlockMeta }
  | { id: string; kind: 'reasoning'; text: string; duration?: number; meta?: BlockMeta }
  | {
      id: string;
      kind: 'tool';
      name: string;
      status: ToolStatus;
      detail: string;
      input?: unknown;
      meta?: BlockMeta;
    }
  | { id: string; kind: 'notice'; text: string; meta?: BlockMeta };

/** 一次 assistant step 的汇总信息：来自服务端消息或 step.* 事件。 */
export type StepInfo = {
  messageID: string;
  agent?: string;
  model?: string;
  started?: number;
  firstToken?: number;
  streamed?: number;
  ended?: number;
  finish?: string;
  tokens?: TokenUsageInfo;
  cost?: number;
  error?: string;
  interrupted?: boolean;
};

export type SkillTag = { id: string; name: string };

export type ToolStatus = 'running' | 'ok' | 'error';

/** 插入 block；同 id 已存在时合并。 */
export function upsert(blocks: Block[], block: Block): Block[] {
  const index = blocks.findIndex((b) => b.id === block.id);
  if (index === -1) return [...blocks, block];
  const next = blocks.slice();
  next[index] = block;
  return next;
}

export function patch(blocks: Block[], id: string, fn: (block: Block) => Block): Block[] {
  const index = blocks.findIndex((b) => b.id === id);
  if (index === -1) return blocks;
  const next = blocks.slice();
  next[index] = fn(next[index]);
  return next;
}

function toolStatus(status: string | undefined): ToolStatus {
  if (status === 'completed') return 'ok';
  if (status === 'error') return 'error';
  return 'running';
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') continue;
    if ('type' in item && item.type === 'text' && typeof item.text === 'string') {
      parts.push(item.text);
    }
  }
  return parts.join('\n');
}

function toolDetail(state: unknown): string {
  if (!state || typeof state !== 'object') return '';
  const value = state as Record<string, any>;
  if (value.status === 'completed' || value.status === 'error') {
    return contentToText(value.content);
  }
  return value.input ? JSON.stringify(value.input, null, 2) : '';
}

/**
 * 用服务端真值重建整个 block 列表。
 * 会话加载和每次运行结束后都会调用，把事件驱动的乐观列表与服务端
 * 实际持久化的内容对齐。
 */
export function blocksFromMessages(messages: SessionMessageInfo[]): Block[] {
  const blocks: Block[] = [];

  for (const message of messages) {
    if (message.type === 'user') {
      if (message.text.trim() || message.files?.length) {
        blocks.push({
          id: `msg:${message.id}`,
          kind: 'user',
          text: message.text,
          skills: message.skills?.map(({ id, name }) => ({ id, name })),
          files: message.files?.map((file) => file.name ?? '附件'),
          meta: { at: message.time.created },
        });
      }
      continue;
    }

    if (message.type !== 'assistant') continue;

    const shared = {
      messageID: message.id,
      at: message.time.created,
      end: message.time.completed ?? message.time.streamed,
    };

    message.content.forEach((part, index) => {
      if (part.type === 'text') {
        if (!part.text.trim()) return;
        blocks.push({
          id: `msg:${message.id}:t${index}`,
          kind: 'text',
          text: part.text,
          meta: shared,
        });
        return;
      }

      if (part.type === 'reasoning') {
        if (!part.text.trim()) return;
        const time = part.time;
        blocks.push({
          id: `msg:${message.id}:r${index}`,
          kind: 'reasoning',
          text: part.text,
          duration: time?.completed ? time.completed - time.created : undefined,
          meta: { ...shared, at: time?.created ?? shared.at, end: time?.completed ?? shared.end },
        });
        return;
      }

      if (part.type === 'tool') {
        blocks.push({
          id: `tool:${part.id}`,
          kind: 'tool',
          name: part.name,
          status: toolStatus(part.state?.status),
          detail: toolDetail(part.state),
          input: part.state?.input,
          meta: { ...shared, at: part.time.created, end: part.time.completed },
        });
      }
    });
  }

  return blocks;
}

/** 从服务端消息整理每个 assistant step 的耗时与用量，供轨迹视图合并实时事件。 */
export function stepsFromMessages(messages: SessionMessageInfo[]): Record<string, StepInfo> {
  const steps: Record<string, StepInfo> = {};
  for (const message of messages) {
    if (message.type !== 'assistant') continue;
    steps[message.id] = {
      messageID: message.id,
      agent: message.agent,
      model: `${message.model.providerID}/${message.model.id}`,
      started: message.time.created,
      firstToken: message.time.firstToken,
      streamed: message.time.streamed,
      ended: message.time.completed,
      finish: message.finish,
      tokens: message.tokens,
      cost: message.cost,
    };
  }
  return steps;
}
