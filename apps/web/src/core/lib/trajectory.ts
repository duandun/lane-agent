import type { SessionMessageInfo, TokenUsageInfo } from '@opencode/client';
import type { Block, StepInfo } from './blocks';

export type TrajectoryKind =
  'user' | 'context' | 'step' | 'text' | 'reasoning' | 'tool' | 'compaction' | 'system';

export type TrajectoryStatus = 'ok' | 'running' | 'error' | 'interrupted';

export type AttachmentSummary = {
  name: string;
  mime?: string;
  size?: number;
  image?: boolean;
};

export type TrajectoryRecord = {
  id: string;
  kind: TrajectoryKind;
  title: string;
  preview: string;
  status: TrajectoryStatus;
  turn: number;
  requestIndex?: number;
  at?: number;
  end?: number;
  duration?: number;
  ttft?: number;
  model?: string;
  agent?: string;
  finish?: string;
  tokens?: TokenUsageInfo;
  cost?: number;
  cumulative?: { tokens: TokenUsageInfo; cost: number };
  input?: unknown;
  output?: string;
  text?: string;
  attachments?: AttachmentSummary[];
  retry?: { attempt: number; error: string };
  live?: boolean;
};

export type TrajectoryTurn = {
  id: string;
  index: number;
  preview: string;
  at?: number;
  end?: number;
  records: TrajectoryRecord[];
};

export type Trajectory = {
  turns: TrajectoryTurn[];
  records: TrajectoryRecord[];
  hasLiveTail: boolean;
};

export type TrajectoryInput = {
  messages: SessionMessageInfo[];
  steps: Record<string, StepInfo>;
  liveBlocks: Block[];
  contextMessages?: SessionMessageInfo[];
};

function preview(text: string, max = 140): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function duration(at: number | undefined, end: number | undefined): number | undefined {
  if (at === undefined || end === undefined) return undefined;
  return Math.max(0, end - at);
}

function messageTime(message: unknown): number {
  const time = (message as { time?: { created?: number } } | null)?.time;
  return typeof time?.created === 'number' ? time.created : 0;
}

function base64Size(data: unknown): number | undefined {
  if (typeof data !== 'string') return undefined;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

function attachmentsOf(fileList: unknown): AttachmentSummary[] {
  if (!Array.isArray(fileList)) return [];
  return fileList.map((file) => {
    const item = (file ?? {}) as { name?: string; mime?: string; data?: unknown };
    return {
      name: item.name ?? item.mime ?? '附件',
      mime: item.mime,
      size: base64Size(item.data),
      image: typeof item.mime === 'string' && item.mime.startsWith('image/'),
    };
  });
}

function stepStatus(info: StepInfo | undefined): TrajectoryStatus {
  if (info?.interrupted) return 'interrupted';
  if (info?.finish === 'error' || info?.error) return 'error';
  if (info?.ended) return 'ok';
  return 'running';
}

function blockStatus(block: Block): TrajectoryStatus {
  if (block.kind === 'tool') return block.status;
  if (block.kind === 'text' || block.kind === 'reasoning') {
    return block.meta?.end ? 'ok' : 'running';
  }
  return 'ok';
}

const SYSTEM_LABELS: Record<string, string> = {
  system: '系统',
  synthetic: '系统',
  skill: '技能',
  shell: '命令',
};

function emptyTokens(): TokenUsageInfo {
  return { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
}

function addTokens(target: TokenUsageInfo, tokens: TokenUsageInfo | undefined) {
  if (!tokens) return;
  target.input += tokens.input;
  target.output += tokens.output;
  target.reasoning += tokens.reasoning;
  target.cache.read += tokens.cache.read;
  target.cache.write += tokens.cache.write;
}

/**
 * 把服务端消息、step 元数据和尚未持久化的流式尾部投影成按轮次组织的轨迹。
 * 纯函数：相同的输入总是得到相同的输出。
 */
export function buildTrajectory({
  messages,
  steps,
  liveBlocks,
  contextMessages = [],
}: TrajectoryInput): Trajectory {
  const turns: TrajectoryTurn[] = [];
  let current: TrajectoryTurn | null = null;
  let requestIndex = 0;
  let liveTail = false;
  const cumulativeTokens = emptyTokens();
  let cumulativeCost = 0;

  function ensureTurn(previewText = ''): TrajectoryTurn {
    if (current) return current;
    current = {
      id: `turn:${turns.length}`,
      index: turns.length,
      preview: previewText,
      records: [],
    };
    turns.push(current);
    return current;
  }

  function push(record: TrajectoryRecord, at?: number, end?: number) {
    const turn = ensureTurn();
    turn.records.push(record);
    if (at !== undefined) turn.at = turn.at === undefined ? at : Math.min(turn.at, at);
    if (end !== undefined) turn.end = Math.max(turn.end ?? 0, end);
  }

  function pushMessage(record: TrajectoryRecord, at?: number, end?: number) {
    push(record, at, end);
  }

  for (const message of messages) {
    if (message.type === 'user') {
      current = {
        id: `turn:${turns.length}`,
        index: turns.length,
        preview: preview(message.text),
        at: message.time.created,
        records: [],
      };
      turns.push(current);
      pushMessage(
        {
          id: `user:${message.id}`,
          kind: 'user',
          title: '用户',
          preview: preview(message.text),
          status: 'ok',
          turn: current.index,
          at: message.time.created,
          end: message.time.created,
          text: message.text,
          attachments: attachmentsOf(message.files),
        },
        message.time.created,
        message.time.created
      );
      continue;
    }

    if (message.type === 'assistant') {
      const info: StepInfo = steps[message.id] ?? {
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
      requestIndex += 1;
      addTokens(cumulativeTokens, info.tokens);
      cumulativeCost += info.cost ?? 0;

      const stepRecord: TrajectoryRecord = {
        id: `step:${message.id}`,
        kind: 'step',
        title: `模型调用 ${requestIndex}`,
        preview: info.model ?? '',
        status: stepStatus(info),
        turn: ensureTurn().index,
        requestIndex,
        at: info.started,
        end: info.ended,
        duration: duration(info.started, info.ended),
        ttft: duration(info.started, info.firstToken),
        model: info.model,
        agent: info.agent,
        finish: info.finish,
        tokens: info.tokens,
        cost: info.cost,
        cumulative: {
          tokens: { ...cumulativeTokens, cache: { ...cumulativeTokens.cache } },
          cost: cumulativeCost,
        },
        retry: message.retry
          ? { attempt: message.retry.attempt, error: JSON.stringify(message.retry.error) }
          : undefined,
      };
      pushMessage(stepRecord, stepRecord.at, stepRecord.end);

      message.content.forEach((part, index) => {
        if (part.type === 'text') {
          if (!part.text.trim()) return;
          const at = info.started ?? message.time.created;
          const end = info.streamed ?? info.ended;
          pushMessage(
            {
              id: `text:${message.id}:${index}`,
              kind: 'text',
              title: '回复',
              preview: preview(part.text),
              status: end ? 'ok' : 'running',
              turn: ensureTurn().index,
              at,
              end,
              duration: duration(at, end),
              text: part.text,
            },
            at,
            end
          );
          return;
        }

        if (part.type === 'reasoning') {
          if (!part.text.trim()) return;
          const at = part.time?.created;
          const end = part.time?.completed;
          pushMessage(
            {
              id: `reasoning:${message.id}:${index}`,
              kind: 'reasoning',
              title: '思考',
              preview: preview(part.text),
              status: end ? 'ok' : 'running',
              turn: ensureTurn().index,
              at,
              end,
              duration: duration(at, end),
              text: part.text,
            },
            at,
            end
          );
          return;
        }

        if (part.type === 'tool') {
          const at = part.time?.created;
          const end = part.time?.completed;
          const status =
            part.state?.status === 'error'
              ? 'error'
              : part.state?.status === 'completed'
                ? 'ok'
                : 'running';
          pushMessage(
            {
              id: `tool:${message.id}:${part.id}`,
              kind: 'tool',
              title: part.name,
              preview: preview(
                part.state?.status === 'completed' || part.state?.status === 'error'
                  ? toolText(part.state)
                  : JSON.stringify(part.state?.input ?? {}, null, 2)
              ),
              status,
              turn: ensureTurn().index,
              at,
              end,
              duration: duration(at, end),
              input: part.state?.input,
              output: toolText(part.state),
            },
            at,
            end
          );
        }
      });
      continue;
    }

    if (message.type === 'compaction') {
      const data = message as {
        time: { created: number };
        status: string;
        reason?: string;
        summary?: string;
        tokens?: TokenUsageInfo;
        cost?: number;
        model?: { providerID: string; id: string };
        error?: unknown;
      };
      const status =
        data.status === 'failed' ? 'error' : data.status === 'running' ? 'running' : 'ok';
      // 独立压缩放在自己的分组里，和前后轮次分开，避免混进上一轮。
      current = {
        id: `turn:${turns.length}`,
        index: turns.length,
        preview: '上下文压缩',
        at: data.time.created,
        records: [],
      };
      turns.push(current);
      pushMessage(
        {
          id: `compaction:${message.id}`,
          kind: 'compaction',
          title: '上下文压缩',
          preview: preview(data.summary ?? data.reason ?? data.status),
          status,
          turn: current.index,
          at: data.time.created,
          end: status === 'running' ? undefined : data.time.created,
          tokens: data.tokens,
          cost: data.cost,
          model: data.model ? `${data.model.providerID}/${data.model.id}` : undefined,
          input: data.reason,
          output: data.summary,
        },
        data.time.created
      );
      current = null;
      continue;
    }

    if (message.type === 'idle' || message.type.endsWith('-switched')) continue;

    const info = message as {
      time?: { created?: number };
      text?: string;
      description?: string;
      type: string;
    };
    const label = SYSTEM_LABELS[message.type] ?? message.type;
    pushMessage(
      {
        id: `system:${(message as { id: string }).id}`,
        kind: 'system',
        title: label,
        preview: preview(info.description ?? info.text ?? message.type),
        status: 'ok',
        turn: ensureTurn().index,
        at: info.time?.created,
        text: info.text,
      },
      info.time?.created
    );
  }

  // 未持久化的流式尾部：按消息 ID 去重，只补缺失的 step。
  const persisted = new Set(messages.map((message) => message.id));
  const live = liveBlocks.filter(
    (block) =>
      !block.id.startsWith('msg:') &&
      (!block.meta?.messageID || !persisted.has(block.meta.messageID))
  );
  if (live.length) liveTail = true;

  const liveSteps = new Map<string, TrajectoryRecord>();
  for (const block of live) {
    if (block.kind === 'user') {
      // 一轮刚结束时 messages 与 blocks 的刷新顺序不定：只要快照里已经有一条
      // 时间接近、文字相同的用户消息，就跳过 local 块，避免同一问题重复出现。
      const at = block.meta?.at;
      const samePrompt = messages.some(
        (message) =>
          message.type === 'user' &&
          message.text.trim() === block.text.trim() &&
          (at === undefined || Math.abs(message.time.created - at) < 60_000)
      );
      if (samePrompt) continue;

      current = {
        id: `turn:${turns.length}`,
        index: turns.length,
        preview: preview(block.text),
        at: block.meta?.at,
        records: [],
      };
      turns.push(current);
      pushMessage(
        {
          id: `user:${block.id}`,
          kind: 'user',
          title: '用户',
          preview: preview(block.text),
          status: 'ok',
          turn: current.index,
          at: block.meta?.at,
          end: block.meta?.at,
          text: block.text,
          live: true,
        },
        block.meta?.at,
        block.meta?.at
      );
      continue;
    }

    const key = block.meta?.messageID ?? 'live';
    let step = liveSteps.get(key);
    if (!step && block.kind !== 'notice') {
      const info = block.meta?.messageID ? steps[block.meta.messageID] : undefined;
      step = {
        id: `step:${key}`,
        kind: 'step',
        title: '进行中',
        preview: info?.model ?? '',
        status: stepStatus(info),
        turn: ensureTurn().index,
        at: info?.started ?? block.meta?.at,
        end: info?.ended,
        duration: duration(info?.started, info?.ended),
        ttft: duration(info?.started, info?.firstToken),
        model: info?.model,
        agent: info?.agent,
        finish: info?.finish,
        tokens: info?.tokens,
        cost: info?.cost,
        live: true,
      };
      liveSteps.set(key, step);
      pushMessage(step, step.at, step.end);
    }

    pushMessage(
      {
        id: `live:${block.id}`,
        kind: block.kind === 'notice' ? 'system' : block.kind,
        title: block.kind === 'tool' ? block.name : block.kind === 'reasoning' ? '思考' : '回复',
        preview: preview(block.kind === 'tool' ? block.detail : block.text),
        status: blockStatus(block),
        turn: ensureTurn().index,
        at: block.meta?.at,
        end: block.meta?.end,
        duration: duration(block.meta?.at, block.meta?.end),
        text: block.kind === 'text' || block.kind === 'reasoning' ? block.text : undefined,
        input: block.kind === 'tool' ? block.input : undefined,
        output: block.kind === 'tool' ? block.detail : undefined,
        live: true,
      },
      block.meta?.at,
      block.meta?.end
    );
  }

  // 当前一次模型调用实际带上的消息上下文（session.context）；
  // 追加到最后一轮里，避免把上下文本身算成一轮。
  if (contextMessages.length) {
    const latest = contextMessages.reduce<number | undefined>((value, message) => {
      const at = (message as { time?: { created?: number } }).time?.created;
      return at === undefined ? value : value === undefined ? at : Math.max(value, at);
    }, undefined);
    if (turns.length) {
      current = turns[turns.length - 1];
    } else {
      current = {
        id: `turn:${turns.length}`,
        index: turns.length,
        preview: '输入上下文',
        at: latest,
        records: [],
      };
      turns.push(current);
    }
    pushMessage(
      {
        id: 'context:input',
        kind: 'context',
        title: '输入上下文',
        preview: `${contextMessages.length} 条消息`,
        status: 'ok',
        turn: current.index,
        at: latest,
        input: contextMessages,
      },
      latest
    );
    current = null;
  }

  return { turns, records: turns.flatMap((turn) => turn.records), hasLiveTail: liveTail };
}

function toolText(state: unknown): string {
  if (!state || typeof state !== 'object') return '';
  const content = (state as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) =>
      part && typeof part === 'object' && 'text' in part
        ? String((part as { text: unknown }).text)
        : ''
    )
    .filter(Boolean)
    .join('\n');
}

/** 合并消息分页：按 id 去重（后到的页面覆盖旧值），按时间升序。 */
export function mergeMessagePages(
  current: SessionMessageInfo[],
  incoming: SessionMessageInfo[]
): SessionMessageInfo[] {
  const map = new Map<string, SessionMessageInfo>();
  for (const message of current) map.set(message.id, message);
  for (const message of incoming) map.set(message.id, message);
  return [...map.values()].sort((a, b) => messageTime(a) - messageTime(b));
}

export function formatBytes(size?: number): string {
  if (size === undefined || Number.isNaN(size)) return '—';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms?: number): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function formatClock(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false });
}

/** 展示/复制用的 JSON 脱敏：data URI 只保留占位符，避免把 base64 带出去。 */
export function sanitizeJson(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[深度截断]';
  if (typeof value === 'string') {
    return value.startsWith('data:') ? '<data URI 已省略>' : value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item, depth + 1));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeJson(item, depth + 1);
    }
    return result;
  }
  return value;
}
