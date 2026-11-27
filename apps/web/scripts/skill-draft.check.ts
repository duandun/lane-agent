import assert from 'node:assert/strict';
import type { Block } from '../src/core/lib/blocks';
import {
  draftSkill,
  hasTurnOperation,
  isSkillLoaded,
  parseSkill,
  skillPrompt,
} from '../src/core/lib/skillDraft';

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

assert.equal(hasTurnOperation(blocks), true);
assert.equal(hasTurnOperation([blocks[0], blocks[5]]), false); // 只有 running，不算完成
assert.equal(hasTurnOperation([blocks[0]]), false);

assert.equal(draft.name, 'preview');
assert.match(draft.description, /导出成 PDF/);
assert.equal(draft.steps, 4);
assert.ok(draft.body.includes('/opt/bin/agent-desktop'));
assert.match(draft.body, /find --app "Preview" --role button --name "导出"/);
assert.ok(!draft.body.includes('@s1:e1'));
assert.ok(draft.body.includes('本次失败的命令'));
assert.ok(draft.body.includes('report.pdf'));
assert.ok(draft.body.includes('ls -la'));
assert.ok(draft.warnings.some((item) => item.includes('<ref>')));

// 结构对齐 music-play
assert.ok(draft.body.startsWith('# 把预览里的报告导出成 PDF'));
assert.ok(draft.body.includes('使用场景：'));
assert.ok(draft.body.includes('## 执行循环'));
assert.ok(draft.body.includes('## 已验证的完整序列'));
assert.ok(draft.body.includes('```bash'));
assert.ok(draft.body.includes('## 输入参数'));
assert.ok(draft.body.includes('## 反模式'));
assert.ok(draft.body.includes('点击「导出」'));
assert.ok(draft.body.includes('{{text}}：本次值 "report.pdf"'));

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

// 只看最后一条用户消息之后的操作；普通命令也进步骤
const multiTurn: Block[] = [
  { id: 'u0', kind: 'user', text: '上一次：把报告导出' },
  {
    id: 'a0',
    kind: 'tool',
    name: 'bash',
    status: 'ok',
    detail: '',
    input: { command: 'agent-desktop click @s1:e1' },
  },
  { id: 'u1', kind: 'user', text: '这次运行测试' },
  {
    id: 'a1',
    kind: 'tool',
    name: 'bash',
    status: 'ok',
    detail: '',
    input: { command: 'npm test' },
  },
];
const turnDraft = draftSkill(multiTurn, { bin: '/opt/bin/agent-desktop' });
assert.equal(turnDraft.steps, 1);
assert.ok(turnDraft.body.includes('npm test'));
assert.ok(turnDraft.body.includes('**执行**'));
assert.ok(!turnDraft.body.includes('@s1:e1'));
assert.ok(turnDraft.body.startsWith('# 这次运行测试'));
assert.equal(turnDraft.description, '这次运行测试');
assert.match(turnDraft.name, /^task-\d{8}$/);
assert.ok(!turnDraft.body.includes('STALE_REF'));
assert.equal(hasTurnOperation(multiTurn), true);

// 最后一条用户消息之后没有操作时，不能存为技能
assert.equal(hasTurnOperation([multiTurn[0], multiTurn[1], multiTurn[2]]), false);

assert.match(draftSkill(chineseOnly).name, /^task-\d{8}$/);

assert.equal(isSkillLoaded([{ id: 'x', name: 'probe' }], 'probe'), true);
assert.equal(isSkillLoaded([{ id: 'probe', name: 'Probe' }], 'probe'), true);
assert.equal(isSkillLoaded([{ id: 'other', name: 'other' }], 'probe'), false);

// 模型返回：去掉包裹代码块、解析 frontmatter
const parsed = parseSkill(
  [
    '```markdown',
    '---',
    'name: music-play',
    'description: "打开音乐并播放歌曲"',
    '---',
    '',
    '# 打开音乐并播放歌曲',
    '',
    '使用场景：…',
    '```',
  ].join('\n')
);
assert.equal(parsed?.name, 'music-play');
assert.equal(parsed?.description, '打开音乐并播放歌曲');
assert.ok(parsed?.body.startsWith('# 打开音乐并播放歌曲'));
assert.equal(parseSkill('没有 frontmatter 的一段话'), null);
assert.equal(parseSkill('---\nname: x\n---\n'), null);

// 重写 prompt：带当前轮次的所有命令、失败原因和参考草稿
const prompt = skillPrompt(blocks, { bin: '/opt/bin/agent-desktop' });
assert.ok(prompt.includes('命令：agent-desktop click @s1:e1'));
assert.ok(prompt.includes('（失败）输出：boom'));
assert.ok(prompt.includes('命令：ls -la'));
assert.ok(prompt.includes('/opt/bin/agent-desktop'));
assert.ok(prompt.includes('<参考草稿>'));

// prompt 只看当前轮次
const turnPrompt = skillPrompt(multiTurn, { bin: '/opt/bin/agent-desktop' });
assert.ok(turnPrompt.includes('命令：npm test'));
assert.ok(!turnPrompt.includes('@s1:e1'));
assert.ok(!turnPrompt.includes('把报告导出'));

console.log('skillDraft check: ok');
