import assert from 'node:assert/strict';
import type { Block } from '../src/core/lib/blocks';
import { draftSkill, hasAgentDesktopRun, isSkillLoaded } from '../src/core/lib/skillDraft';

const snapshot = JSON.stringify({
  ok: true,
  data: {
    nodes: [
      { ref_id: '@s1:e1', role: 'button', name: '导出' },
      { ref: '@s1:e2', role: 'button', name: '存储' },
    ],
  },
});

const blocks: Block[] = [
  { id: 'u1', kind: 'user', text: '把预览里的报告导出成 PDF' },
  {
    id: 't1',
    kind: 'tool',
    name: 'bash',
    status: 'ok',
    detail: snapshot,
    input: { command: 'agent-desktop snapshot --app "Preview" -i' },
  },
  {
    id: 't2',
    kind: 'tool',
    name: 'bash',
    status: 'ok',
    detail: '{"ok":true}',
    input: { command: 'agent-desktop click @s1:e1' },
  },
  {
    id: 't3',
    kind: 'tool',
    name: 'bash',
    status: 'error',
    detail: 'boom',
    input: { command: 'agent-desktop type @s1:e9 "report.pdf"' },
  },
  {
    id: 't4',
    kind: 'tool',
    name: 'bash',
    status: 'ok',
    detail: '',
    input: { command: 'ls -la' },
  },
  {
    id: 't5',
    kind: 'tool',
    name: 'bash',
    status: 'running',
    detail: '',
    input: { command: 'agent-desktop press return' },
  },
];

const draft = draftSkill(blocks, { bin: '/opt/bin/agent-desktop' });

assert.equal(hasAgentDesktopRun(blocks), true);
assert.equal(hasAgentDesktopRun([blocks[0], blocks[4]]), false);

assert.equal(draft.name, 'preview');
assert.match(draft.description, /导出成 PDF/);
assert.equal(draft.steps, 3);
assert.ok(draft.body.includes('/opt/bin/agent-desktop'));
assert.match(draft.body, /find --app "Preview" --role button --name "导出"/);
assert.ok(!draft.body.includes('@s1:e1'));
assert.ok(draft.body.includes('已知坑'));
assert.ok(draft.body.includes('report.pdf'));
assert.ok(!draft.body.includes('ls -la'));
assert.ok(draft.warnings.some((item) => item.includes('<ref>')));

const many: Block[] = Array.from({ length: 51 }, (_, index) => ({
  id: `m${index}`,
  kind: 'tool' as const,
  name: 'bash',
  status: 'ok' as const,
  detail: '',
  input: { command: 'agent-desktop press return' },
}));

assert.equal(draftSkill(many).steps, 50);

const chineseOnly: Block[] = [
  { id: 'u', kind: 'user', text: '帮我操作一下' },
  {
    id: 'x',
    kind: 'tool',
    name: 'bash',
    status: 'ok',
    detail: '',
    input: { command: 'agent-desktop press return' },
  },
];

assert.match(draftSkill(chineseOnly).name, /^desktop-task-\d{8}$/);

assert.equal(isSkillLoaded([{ id: 'x', name: 'probe' }], 'probe'), true);
assert.equal(isSkillLoaded([{ id: 'probe', name: 'Probe' }], 'probe'), true);
assert.equal(isSkillLoaded([{ id: 'other', name: 'other' }], 'probe'), false);

console.log('skillDraft check: ok');
