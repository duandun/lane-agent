import { describe, expect, it } from 'vitest';
import { blocksFromMessages, stepsFromMessages } from '@core/lib/blocks';

const messages = [
  { type: 'user', id: 'u1', time: { created: 1000 }, text: 'hi' },
  {
    type: 'assistant',
    id: 'a1',
    time: { created: 1100, firstToken: 1200, streamed: 1800, completed: 1900 },
    tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 0, write: 0 } },
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
  { type: 'compaction', id: 'c1', time: { created: 2000 } },
] as never;

const blocks = blocksFromMessages(messages);
const steps = stepsFromMessages(messages);

describe('blocksFromMessages', () => {
  it('用户消息带创建时间', () => {
    const user = blocks.find((block) => block.kind === 'user');
    expect(user?.meta?.at).toBe(1000);
  });

  it('文本块带归属消息和整轮起止时间', () => {
    const text = blocks.find((block) => block.kind === 'text');
    expect(text?.meta?.messageID).toBe('a1');
    expect(text?.meta?.at).toBe(1100);
    expect(text?.meta?.end).toBe(1900);
  });

  it('推理和工具块用自己的起止时间', () => {
    const reasoning = blocks.find((block) => block.kind === 'reasoning');
    expect(reasoning?.meta?.at).toBe(1150);
    expect(reasoning?.meta?.end).toBe(1190);

    const tool = blocks.find((block) => block.kind === 'tool');
    expect(tool?.meta?.at).toBe(1210);
    expect(tool?.meta?.end).toBe(1300);
  });
});

describe('stepsFromMessages', () => {
  it('按助手消息聚合流式与 token 信息', () => {
    expect(steps.a1).toEqual({
      messageID: 'a1',
      agent: 'build',
      model: 'p/m',
      started: 1100,
      firstToken: 1200,
      streamed: 1800,
      ended: 1900,
      finish: 'stop',
      tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 0, write: 0 } },
      cost: 0.01,
    });
  });

  it('忽略 compaction 等非助手消息', () => {
    expect(steps.c1).toBeUndefined();
  });
});
