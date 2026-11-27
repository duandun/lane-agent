import { describe, expect, it } from 'vitest';
import type { Block } from '@core/lib/blocks';
import { draftSkill, hasAgentDesktopRun, isSkillLoaded } from '@core/lib/skillDraft';

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

describe('hasAgentDesktopRun', () => {
  it('会话里出现过已结束的 agent-desktop 命令', () => {
    expect(hasAgentDesktopRun(blocks)).toBe(true);
  });

  it('只有普通命令和运行中的命令时不触发', () => {
    expect(hasAgentDesktopRun([blocks[0], blocks[4]])).toBe(false);
  });
});

describe('draftSkill', () => {
  const draft = draftSkill(blocks, { bin: '/opt/bin/agent-desktop' });

  it('用应用名生成名称，用用户提问作描述', () => {
    expect(draft.name).toBe('preview');
    expect(draft.description).toMatch(/导出成 PDF/);
  });

  it('只收已结束的 agent-desktop 命令', () => {
    expect(draft.steps).toBe(3);
  });

  it('写绝对 bin 路径，并把 snapshot 里的 ref 还原成 find 定位', () => {
    expect(draft.body).toContain('/opt/bin/agent-desktop');
    expect(draft.body).toMatch(/find --app "Preview" --role button --name "导出"/);
    expect(draft.body).not.toContain('@s1:e1');
  });

  it('失败命令进已知坑，普通命令被忽略', () => {
    expect(draft.body).toContain('已知坑');
    expect(draft.body).toContain('report.pdf');
    expect(draft.body).not.toContain('ls -la');
    expect(draft.warnings.some((item) => item.includes('<ref>'))).toBe(true);
  });

  it('最多保留 50 条命令', () => {
    expect(draftSkill(many).steps).toBe(50);
  });

  it('没有英文应用名时退回日期名', () => {
    expect(draftSkill(chineseOnly).name).toMatch(/^desktop-task-\d{8}$/);
  });
});

describe('isSkillLoaded', () => {
  it('按 id 或 name 匹配技能列表', () => {
    expect(isSkillLoaded([{ id: 'x', name: 'probe' }], 'probe')).toBe(true);
    expect(isSkillLoaded([{ id: 'probe', name: 'Probe' }], 'probe')).toBe(true);
    expect(isSkillLoaded([{ id: 'other', name: 'other' }], 'probe')).toBe(false);
  });
});
