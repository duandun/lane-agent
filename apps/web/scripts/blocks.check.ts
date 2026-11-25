import assert from 'node:assert/strict';
import { blocksFromMessages, stepsFromMessages } from '../src/core/lib/blocks';

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
const user = blocks.find((block) => block.kind === 'user');
assert.equal(user?.meta?.at, 1000);

const text = blocks.find((block) => block.kind === 'text');
assert.equal(text?.meta?.messageID, 'a1');
assert.equal(text?.meta?.at, 1100);
assert.equal(text?.meta?.end, 1900);

const reasoning = blocks.find((block) => block.kind === 'reasoning');
assert.equal(reasoning?.meta?.at, 1150);
assert.equal(reasoning?.meta?.end, 1190);

const tool = blocks.find((block) => block.kind === 'tool');
assert.equal(tool?.meta?.at, 1210);
assert.equal(tool?.meta?.end, 1300);

const steps = stepsFromMessages(messages);
assert.deepEqual(steps.a1, {
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
assert.equal(steps.c1, undefined);

console.log('blocks check: ok');
