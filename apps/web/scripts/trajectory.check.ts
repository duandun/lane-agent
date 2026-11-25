import assert from 'node:assert/strict';
import { stepsFromMessages } from '../src/core/lib/blocks';
import { buildTrajectory, mergeMessagePages, sanitizeJson } from '../src/core/lib/trajectory';

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

assert.equal(trajectory.turns.length, 3);
assert.equal(trajectory.turns[0].preview, '第一问');
assert.equal(trajectory.turns[1].preview, '上下文压缩');
assert.equal(trajectory.turns[2].preview, '第二问');

const firstTurnKinds = trajectory.turns[0].records.map((record) => record.kind);
assert.deepEqual(firstTurnKinds, ['user', 'step', 'text', 'reasoning', 'tool']);

const step1 = trajectory.records.find((record) => record.id === 'step:a1');
assert.equal(step1?.requestIndex, 1);
assert.equal(step1?.tokens?.input, 10);
assert.equal(step1?.cumulative?.tokens.input, 10);
assert.equal(step1?.ttft, 100);
assert.equal(step1?.duration, 400);

const step2 = trajectory.records.find((record) => record.id === 'step:a2');
assert.equal(step2?.requestIndex, 2);
assert.equal(step2?.cumulative?.tokens.input, 30);

const compaction = trajectory.records.find((record) => record.kind === 'compaction');
assert.equal(compaction?.preview, '压缩摘要');
assert.equal(compaction?.tokens?.input, 1);

const system = trajectory.records.find((record) => record.kind === 'system');
assert.equal(system?.preview, '系统提示');

assert.equal(
  trajectory.records.some((record) => record.id === 'system:i1'),
  false
);

const tool = trajectory.records.find((record) => record.kind === 'tool');
assert.equal(tool?.duration, 90);

// 实时尾部：未持久化的消息才进入，已持久化的 messageID 不重复。
const liveBlocks = [
  {
    id: 'msg:u2',
    kind: 'user',
    text: '第二问',
    meta: { at: 2000 },
  },
  {
    id: 'live:u3',
    kind: 'user',
    text: '第三问',
    meta: { at: 3000 },
  },
  {
    id: 'text:live:1',
    kind: 'text',
    text: '正在回答',
    meta: { at: 3100, messageID: 'a3' },
  },
] as never;

const liveTrajectory = buildTrajectory({ messages, steps, liveBlocks });
assert.equal(liveTrajectory.hasLiveTail, true);
assert.equal(liveTrajectory.turns[liveTrajectory.turns.length - 1].preview, '第三问');
const liveStep = liveTrajectory.records.find((record) => record.kind === 'step' && record.live);
assert.equal(liveStep?.status, 'running');
assert.equal(liveTrajectory.records.filter((record) => record.kind === 'user').length, 3);

// 中断状态优先于 running。
const interrupted = buildTrajectory({
  messages,
  steps: { ...steps, a2: { ...steps.a2, interrupted: true } },
  liveBlocks: [],
});
assert.equal(interrupted.records.find((record) => record.id === 'step:a2')?.status, 'interrupted');

// 分页合并：去重、按时间排序。
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
assert.deepEqual(
  merged.map((message) => message.id),
  ['u1', 'a1', 'u2']
);

// 实时尾部与已持久化用户消息去重：最后一条持久化消息就是同一提问时，跳过 local 块。
const deduped = buildTrajectory({
  messages,
  steps,
  liveBlocks: [{ id: 'local:2', kind: 'user', text: '第二问', meta: { at: 2000 } }] as never,
});
assert.equal(deduped.records.filter((record) => record.kind === 'user').length, 2);

// 输入上下文：session.context 返回的消息作为独立分组追加。
const withContext = buildTrajectory({
  messages,
  steps,
  liveBlocks: [],
  contextMessages: [
    { type: 'system', id: 'ctx1', time: { created: 500 }, text: 'AGENTS.md 指令' },
    { type: 'user', id: 'ctx2', time: { created: 1000 }, text: '第一问' },
  ] as never,
});
assert.equal(withContext.turns.length, trajectory.turns.length);
const contextRecord = withContext.records.find((record) => record.kind === 'context');
assert.ok(contextRecord);
assert.equal((contextRecord.input as unknown[]).length, 2);

// 原始 JSON 脱敏：base64 data URI 不进入复制/展示内容。
assert.deepEqual(sanitizeJson({ data: 'data:image/png;base64,AAAA', text: 'ok' }), {
  data: '<data URI 已省略>',
  text: 'ok',
});
assert.deepEqual(sanitizeJson({ a: [{ b: 'data:text/plain,xx' }] }), {
  a: [{ b: '<data URI 已省略>' }],
});

console.log('trajectory check: ok');
