import { describe, expect, it } from 'vitest';
import { stepsFromMessages } from '@core/lib/blocks';
import { buildTrajectory, mergeMessagePages, sanitizeJson } from '@core/lib/trajectory';

const tokens = (input: number, output = 1) => ({
  input,
  output,
  reasoning: 0,
  cache: { read: 0, write: 0 },
});

const messages = [
  { type: 'user', id: 'u1', time: { created: 1000 }, text: '第一问' },
  {
    type: 'assistant',
    id: 'a1',
    time: { created: 1100, firstToken: 1200, streamed: 1400, completed: 1500 },
    tokens: tokens(10, 5),
    cost: 0.01,
    model: { providerID: 'p', id: 'm' },
    agent: 'build',
    finish: 'stop',
    content: [
      { type: 'text', text: 'ok' },
      { type: 'reasoning', text: 'think', time: { created: 1150, completed: 1190 } },
      {
        type: 'tool',
        id: 't1',
        name: 'read',
        state: {
          status: 'completed',
          input: { file: 'a' },
          content: [{ type: 'text', text: 'done' }],
        },
        time: { created: 1210, ran: 1220, completed: 1300 },
      },
    ],
  },
  {
    type: 'compaction',
    id: 'c1',
    time: { created: 1600 },
    status: 'completed',
    reason: 'auto',
    summary: '压缩摘要',
    tokens: tokens(1, 1),
    cost: 0.001,
  },
  { type: 'user', id: 'u2', time: { created: 2000 }, text: '第二问' },
  {
    type: 'assistant',
    id: 'a2',
    time: { created: 2100, firstToken: 2200, streamed: 2400, completed: 2500 },
    tokens: tokens(20, 10),
    cost: 0.02,
    model: { providerID: 'p', id: 'm' },
    agent: 'build',
    finish: 'stop',
    content: [{ type: 'text', text: 'ok2' }],
  },
  { type: 'system', id: 's1', time: { created: 2600 }, text: '系统提示' },
  { type: 'idle', id: 'i1', time: { created: 2700 }, outcome: 'succeeded' },
] as never;

const steps = stepsFromMessages(messages);
const trajectory = buildTrajectory({ messages, steps, liveBlocks: [] });

describe('buildTrajectory', () => {
  it('按用户提问和压缩切分轮次', () => {
    expect(trajectory.turns.map((turn) => turn.preview)).toEqual([
      '第一问',
      '上下文压缩',
      '第二问',
    ]);
  });

  it('第一轮的记录保持消息内顺序', () => {
    const kinds = trajectory.turns[0].records.map((record) => record.kind);
    expect(kinds).toEqual(['user', 'step', 'text', 'reasoning', 'tool']);
  });

  it('步记录带请求序号、累计 token、首 token 延迟和耗时', () => {
    const step1 = trajectory.records.find((record) => record.id === 'step:a1');
    expect(step1?.requestIndex).toBe(1);
    expect(step1?.tokens?.input).toBe(10);
    expect(step1?.cumulative?.tokens.input).toBe(10);
    expect(step1?.ttft).toBe(100);
    expect(step1?.duration).toBe(400);

    const step2 = trajectory.records.find((record) => record.id === 'step:a2');
    expect(step2?.requestIndex).toBe(2);
    expect(step2?.cumulative?.tokens.input).toBe(30);
  });

  it('压缩和系统消息进入记录，idle 不进入', () => {
    const compaction = trajectory.records.find((record) => record.kind === 'compaction');
    expect(compaction?.preview).toBe('压缩摘要');
    expect(compaction?.tokens?.input).toBe(1);

    const system = trajectory.records.find((record) => record.kind === 'system');
    expect(system?.preview).toBe('系统提示');
    expect(trajectory.records.some((record) => record.id === 'system:i1')).toBe(false);
  });

  it('工具记录带耗时', () => {
    const tool = trajectory.records.find((record) => record.kind === 'tool');
    expect(tool?.duration).toBe(90);
  });

  it('实时尾部只收未持久化消息，已持久化的不重复', () => {
    const liveBlocks = [
      { id: 'msg:u2', kind: 'user', text: '第二问', meta: { at: 2000 } },
      { id: 'live:u3', kind: 'user', text: '第三问', meta: { at: 3000 } },
      { id: 'text:live:1', kind: 'text', text: '正在回答', meta: { at: 3100, messageID: 'a3' } },
    ] as never;

    const live = buildTrajectory({ messages, steps, liveBlocks });
    expect(live.hasLiveTail).toBe(true);
    expect(live.turns[live.turns.length - 1].preview).toBe('第三问');
    const liveStep = live.records.find((record) => record.kind === 'step' && record.live);
    expect(liveStep?.status).toBe('running');
    expect(live.records.filter((record) => record.kind === 'user')).toHaveLength(3);
  });

  it('中断状态优先于 running', () => {
    const interrupted = buildTrajectory({
      messages,
      steps: { ...steps, a2: { ...steps.a2, interrupted: true } },
      liveBlocks: [],
    });
    expect(interrupted.records.find((record) => record.id === 'step:a2')?.status).toBe(
      'interrupted'
    );
  });

  it('最后一条持久化消息是同一提问时跳过 local 块', () => {
    const deduped = buildTrajectory({
      messages,
      steps,
      liveBlocks: [{ id: 'local:2', kind: 'user', text: '第二问', meta: { at: 2000 } }] as never,
    });
    expect(deduped.records.filter((record) => record.kind === 'user')).toHaveLength(2);
  });

  it('输入上下文作为独立分组追加，不增加轮次', () => {
    const withContext = buildTrajectory({
      messages,
      steps,
      liveBlocks: [],
      contextMessages: [
        { type: 'system', id: 'ctx1', time: { created: 500 }, text: 'AGENTS.md 指令' },
        { type: 'user', id: 'ctx2', time: { created: 1000 }, text: '第一问' },
      ] as never,
    });
    expect(withContext.turns).toHaveLength(trajectory.turns.length);
    const contextRecord = withContext.records.find((record) => record.kind === 'context');
    expect(contextRecord).toBeTruthy();
    expect(contextRecord?.input).toHaveLength(2);
  });
});

describe('mergeMessagePages', () => {
  it('去重并按时间排序', () => {
    const merged = mergeMessagePages(
      [
        { type: 'user', id: 'u1', time: { created: 1000 }, text: 'a' },
        { type: 'assistant', id: 'a1', time: { created: 1100 } },
      ] as never,
      [
        { type: 'user', id: 'u1', time: { created: 1000 }, text: 'a' },
        { type: 'user', id: 'u2', time: { created: 2000 }, text: 'b' },
      ] as never
    );
    expect(merged.map((message) => message.id)).toEqual(['u1', 'a1', 'u2']);
  });
});

describe('sanitizeJson', () => {
  it('把 base64 data URI 替换成占位符', () => {
    expect(sanitizeJson({ data: 'data:image/png;base64,AAAA', text: 'ok' })).toEqual({
      data: '<data URI 已省略>',
      text: 'ok',
    });
    expect(sanitizeJson({ a: [{ b: 'data:text/plain,xx' }] })).toEqual({
      a: [{ b: '<data URI 已省略>' }],
    });
  });
});
