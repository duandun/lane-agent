import { describe, expect, it } from 'vitest';
import type { Block } from '@core/lib/blocks';
import {
  draftSkill,
  hasTurnOperation,
  isSkillLoaded,
  parseSkill,
  skillPrompt,
} from '@core/lib/skillDraft';

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

const many: Block[] = Array.from({ length: 51 }, (_, index) => ({
  id: `m${index}`,
  kind: 'tool' as const,
  name: 'bash',
  status: 'ok' as const,
  detail: '',
  input: { command: 'agent-desktop press return' },
}));

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

// 只看最后一条用户消息之后的操作；普通命令也进步骤。
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

describe('hasTurnOperation', () => {
  it('当前轮次有已结束的命令时可用', () => {
    expect(hasTurnOperation(blocks)).toBe(true);
    expect(hasTurnOperation(multiTurn)).toBe(true);
  });

  it('只有运行中的命令不算', () => {
    expect(hasTurnOperation([blocks[0], blocks[5]])).toBe(false);
  });

  it('只有用户消息不算', () => {
    expect(hasTurnOperation([blocks[0]])).toBe(false);
  });

  it('最后一条用户消息之后没有命令时不算', () => {
    expect(hasTurnOperation([multiTurn[0], multiTurn[1], multiTurn[2]])).toBe(false);
  });
});

describe('draftSkill', () => {
  const draft = draftSkill(blocks, { bin: '/opt/bin/agent-desktop' });

  it('用应用名生成名称，用用户提问作描述', () => {
    expect(draft.name).toBe('preview');
    expect(draft.description).toMatch(/导出成 PDF/);
  });

  it('收当前轮次里所有有命令的工具调用，普通命令也算', () => {
    expect(draft.steps).toBe(4);
  });

  it('写绝对 bin 路径，并把 snapshot 里的 ref 还原成 find 定位', () => {
    expect(draft.body).toContain('/opt/bin/agent-desktop');
    expect(draft.body).toMatch(/find --app "Preview" --role button --name "导出"/);
    expect(draft.body).not.toContain('@s1:e1');
  });

  it('失败命令进本次失败的命令，普通命令原样进步骤', () => {
    expect(draft.body).toContain('本次失败的命令');
    expect(draft.body).toContain('report.pdf');
    expect(draft.body).toContain('ls -la');
    expect(draft.warnings.some((item) => item.includes('<ref>'))).toBe(true);
  });

  it('正文结构对齐 music-play', () => {
    expect(draft.body.startsWith('# 把预览里的报告导出成 PDF')).toBe(true);
    expect(draft.body).toContain('使用场景：');
    expect(draft.body).toContain('## 执行循环');
    expect(draft.body).toContain('## 已验证的完整序列');
    expect(draft.body).toContain('```bash');
    expect(draft.body).toContain('## 输入参数');
    expect(draft.body).toContain('## 反模式');
    expect(draft.body).toContain('点击「导出」');
    expect(draft.body).toContain('{{text}}：本次值 "report.pdf"');
  });

  it('最多保留 50 条命令', () => {
    expect(draftSkill(many).steps).toBe(50);
  });

  it('只使用最后一条用户消息之后的轮次', () => {
    const turnDraft = draftSkill(multiTurn, { bin: '/opt/bin/agent-desktop' });
    expect(turnDraft.steps).toBe(1);
    expect(turnDraft.body).toContain('npm test');
    expect(turnDraft.body).toContain('**执行**');
    expect(turnDraft.body).not.toContain('@s1:e1');
    expect(turnDraft.body.startsWith('# 这次运行测试')).toBe(true);
    expect(turnDraft.description).toBe('这次运行测试');
    expect(turnDraft.name).toMatch(/^task-\d{8}$/);
    expect(turnDraft.body).not.toContain('STALE_REF');
  });

  it('没有英文应用名时退回日期名', () => {
    expect(draftSkill(chineseOnly).name).toMatch(/^task-\d{8}$/);
  });
});

describe('isSkillLoaded', () => {
  it('按 id 或 name 匹配技能列表', () => {
    expect(isSkillLoaded([{ id: 'x', name: 'probe' }], 'probe')).toBe(true);
    expect(isSkillLoaded([{ id: 'probe', name: 'Probe' }], 'probe')).toBe(true);
    expect(isSkillLoaded([{ id: 'other', name: 'other' }], 'probe')).toBe(false);
  });
});

describe('parseSkill', () => {
  it('去掉包裹代码块并解析 frontmatter', () => {
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
    expect(parsed?.name).toBe('music-play');
    expect(parsed?.description).toBe('打开音乐并播放歌曲');
    expect(parsed?.body.startsWith('# 打开音乐并播放歌曲')).toBe(true);
  });

  it('不是 SKILL.md 时返回 null', () => {
    expect(parseSkill('没有 frontmatter 的一段话')).toBeNull();
    expect(parseSkill('---\nname: x\n---\n')).toBeNull();
  });
});

describe('skillPrompt', () => {
  it('带当前轮次的所有命令、失败原因和参考草稿', () => {
    const prompt = skillPrompt(blocks, { bin: '/opt/bin/agent-desktop' });
    expect(prompt).toContain('命令：agent-desktop click @s1:e1');
    expect(prompt).toContain('（失败）输出：boom');
    expect(prompt).toContain('命令：ls -la');
    expect(prompt).toContain('/opt/bin/agent-desktop');
    expect(prompt).toContain('<参考草稿>');
  });

  it('只看当前轮次', () => {
    const turnPrompt = skillPrompt(multiTurn, { bin: '/opt/bin/agent-desktop' });
    expect(turnPrompt).toContain('命令：npm test');
    expect(turnPrompt).not.toContain('@s1:e1');
    expect(turnPrompt).not.toContain('把报告导出');
  });
});
