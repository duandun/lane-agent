import type { Block } from './blocks';

export type SkillDraft = {
  name: string;
  description: string;
  body: string;
  steps: number;
  warnings: string[];
};

type ToolBlock = Extract<Block, { kind: 'tool' }>;
type RefInfo = { role?: string; name?: string };

const MAX_STEPS = 50;
const MAX_DETAIL = 200_000;
const REF_RE = /@[A-Za-z0-9]+:e\d+/g;
const BIN_RE = /(?:^|\s)([^\s]*agent-desktop(?:\.exe)?)(?:\s+([\s\S]*))?/;

function commandOf(block: ToolBlock): string | null {
  const input = block.input;
  if (!input || typeof input !== 'object') return null;
  const command = (input as { command?: unknown }).command;
  return typeof command === 'string' ? command : null;
}

function parseCommand(command: string): { bin: string; args: string } | null {
  const match = command.match(BIN_RE);
  if (!match) return null;
  return { bin: match[1], args: (match[2] ?? '').trim() };
}

function collectRefs(value: unknown, map: Map<string, RefInfo>, depth = 0): void {
  if (depth > 12 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, map, depth + 1);
    return;
  }
  const node = value as Record<string, unknown>;
  const ref =
    typeof node.ref_id === 'string'
      ? node.ref_id
      : typeof node.ref === 'string'
        ? node.ref
        : undefined;
  if (ref) {
    const role = typeof node.role === 'string' ? node.role : undefined;
    const name = typeof node.name === 'string' ? node.name : undefined;
    if (role || name) map.set(ref, { role, name });
  }
  for (const item of Object.values(node)) collectRefs(item, map, depth + 1);
}

function flagValue(args: string, flag: string): string | undefined {
  const match = args.match(new RegExp(`${flag}(?:=|\\s+)("[^"]+"|'[^']+'|\\S+)`));
  if (!match) return undefined;
  return match[1].replace(/^['"]|['"]$/g, '');
}

function slugify(value: string | undefined): string | null {
  if (!value) return null;
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function firstLine(text: string, max = 40): string {
  const line = text.trim().split('\n')[0];
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 命令动词转成步骤标题里的中文动作，未知动词保留原文。 */
const ACTION_LABELS: Record<string, string> = {
  click: '点击',
  type: '输入',
  press: '按键',
  focus: '聚焦',
  clear: '清空',
  launch: '打开',
  wait: '等待',
  screenshot: '截图',
  find: '查找',
  scroll: '滚动',
  drag: '拖拽',
  get: '读取',
  is: '检查',
  clipboard: '剪贴板',
};

function actionLabel(args: string): string {
  const verb = args.trim().split(/\s+/)[0] ?? '';
  return ACTION_LABELS[verb] ?? (verb || '执行');
}

function firstUserText(blocks: Block[]): string {
  const user = blocks.find((block) => block.kind === 'user');
  return user && user.kind === 'user' ? user.text.trim() : '';
}

function refMap(blocks: Block[]): Map<string, RefInfo> {
  const map = new Map<string, RefInfo>();
  for (const block of blocks) {
    if (block.kind !== 'tool' || block.status === 'running') continue;
    const text = block.detail.slice(0, MAX_DETAIL).trim();
    if (!text) continue;
    try {
      collectRefs(JSON.parse(text), map);
    } catch {
      // 输出不是 JSON 时只保留占位符，不阻断生成。
    }
  }
  return map;
}

export function hasAgentDesktopRun(blocks: Block[]): boolean {
  return blocks.some(
    (block) =>
      block.kind === 'tool' &&
      block.status !== 'running' &&
      (commandOf(block)?.includes('agent-desktop') ?? false)
  );
}

export function draftSkill(
  blocks: Block[],
  opts: { name?: string; description?: string; bin?: string } = {}
): SkillDraft {
  const bin = opts.bin ?? 'agent-desktop';
  const refs = refMap(blocks);
  const warnings: string[] = [];

  const tools = blocks.filter(
    (block): block is ToolBlock =>
      block.kind === 'tool' &&
      block.status !== 'running' &&
      (commandOf(block)?.includes('agent-desktop') ?? false)
  );
  const picked = tools.slice(0, MAX_STEPS);
  if (tools.length > MAX_STEPS) {
    warnings.push(`共 ${tools.length} 条命令，只保留前 ${MAX_STEPS} 条。`);
  }

  let scopeApp: string | undefined;
  let scopeSurface: string | undefined;
  const steps: string[] = [];
  const pitfalls: string[] = [];
  const params = new Set<string>();
  let unresolved = 0;

  for (const block of picked) {
    const command = commandOf(block);
    const parsed = command ? parseCommand(command) : null;
    if (!parsed) continue;
    const { args } = parsed;

    const app = flagValue(args, '--app');
    const surface = flagValue(args, '--surface');
    if (app) scopeApp = app;
    if (surface) scopeSurface = surface;
    if (app) params.add(`- {{app}}：本次值 "${app}"`);
    for (const match of args.matchAll(/(?:^|\s)(\/[^\s"'`]+)/g)) {
      params.add(`- {{path}}：本次值 "${match[1]}"`);
    }
    // 输入过的文本（歌名、文件名等）是最常变的参数。
    const typed = args.match(/\btype\s+(?:\S+\s+)?(['"])(.*?)\1/);
    if (typed) params.add(`- {{text}}：本次值 "${typed[2]}"`);

    if (block.status === 'error') {
      if (args.match(REF_RE)?.some((ref) => !refs.has(ref))) unresolved += 1;
      pitfalls.push(
        `- 上次失败的命令：\`${bin} ${args}\`（输出：${block.detail.trim().slice(0, 200)}）`
      );
      continue;
    }

    if (/^snapshot\b/.test(args)) {
      steps.push(`**观察界面**：\`${bin} ${args}\``);
      continue;
    }

    const matches = [...args.matchAll(REF_RE)];
    if (!matches.length) {
      steps.push(`**${actionLabel(args)}**：\`${bin} ${args}\``);
      continue;
    }

    const ref = matches[0][0];
    const info = refs.get(ref);
    if (!info) unresolved += 1;
    const action = args.replace(REF_RE, '<ref>');
    if (info) {
      const find = [bin, 'find'];
      if (scopeApp) find.push('--app', JSON.stringify(scopeApp));
      if (scopeSurface) find.push('--surface', scopeSurface);
      if (info.role) find.push('--role', info.role);
      if (info.name) find.push('--name', JSON.stringify(info.name));
      const label = info.name ?? info.role ?? '目标元素';
      steps.push(
        `**${actionLabel(args)}「${label}」**：先 \`${find.join(' ')}\`，再执行 \`${bin} ${action}\``
      );
    } else {
      steps.push(
        `**${actionLabel(args)}**：\`${bin} ${action}\`（原 ref 无法还原，先重新 snapshot 确认定位方式）`
      );
    }
  }

  if (unresolved) {
    warnings.push(`${unresolved} 个元素无法从 snapshot 输出中还原，已用 <ref> 占位。`);
  }

  const app = scopeApp;
  const name = opts.name ?? slugify(app) ?? `desktop-task-${today()}`;
  const userText = firstUserText(blocks);
  const scenario = userText || `在 ${app ?? '桌面应用'} 中完成一次操作。`;
  const description = opts.description ?? scenario.slice(0, 200);

  // 结构对齐手写的 music-play：场景 → 执行循环 → 完整序列 → 参数 → 反模式。
  const title = userText ? firstLine(userText) : app ? `${app} 操作` : '桌面操作';
  const sequence = picked.flatMap((block) => {
    const command = commandOf(block);
    const parsed = command ? parseCommand(command) : null;
    if (!parsed || block.status === 'error') return [];
    return [`${bin} ${parsed.args.replace(REF_RE, '<ref>')}`];
  });

  const body = [
    `# ${title}`,
    '',
    `使用场景：${scenario}`,
    '',
    '## 执行循环',
    '',
    steps.length
      ? steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')
      : '1. 重新观察目标界面后再执行。',
    '',
    '## 已验证的完整序列',
    '',
    sequence.length
      ? ['```bash', ...sequence, '```'].join('\n')
      : '（本次没有成功保留的命令，先手动跑通一次再补到这里。）',
    '',
    '## 输入参数',
    '',
    params.size ? [...params].join('\n') : '- 无显式参数；需要时直接修改上面的命令。',
    '',
    '## 反模式',
    '',
    '- 不要复用上一次 snapshot 的 ref：编号每次都会变，先重新 `find` / `snapshot` 定位。',
    '- `STALE_REF` / `AMBIGUOUS_TARGET`：不要盲目重复点击，重新观察界面后再动手。',
    '- 只有 `error.disposition.retry === "safe"` 才重试；其余先读取当前状态再决定。',
    pitfalls.length ? `\n### 本次失败的命令\n\n${pitfalls.join('\n')}` : '',
  ]
    .join('\n')
    .trimEnd();

  return { name, description, body, steps: picked.length, warnings };
}

const PROMPT_LIMIT = 24_000;

/** 喂给模型的对话片段：只保留用户、助手、思考和有 agent-desktop 命令的工具调用。 */
function transcript(blocks: Block[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.kind === 'user') lines.push(`用户：${clip(block.text.trim(), 1500)}`);
    else if (block.kind === 'text') lines.push(`助手：${clip(block.text.trim(), 1500)}`);
    else if (block.kind === 'reasoning') lines.push(`思考：${clip(block.text.trim(), 1200)}`);
    else if (block.kind === 'tool') {
      const command = commandOf(block);
      if (!command?.includes('agent-desktop')) continue;
      const failure =
        block.status === 'error' ? `（失败）输出：${clip(block.detail.trim(), 400)}` : '';
      lines.push(`命令：${command}${failure}`);
    }
  }
  return clip(lines.filter(Boolean).join('\n'), PROMPT_LIMIT);
}

/** 让当前模型按 music-play 的写法重写草稿。 */
export function skillPrompt(
  blocks: Block[],
  opts: { bin?: string; draft?: SkillDraft } = {}
): string {
  const bin = opts.bin ?? 'agent-desktop';
  const draft = opts.draft ?? draftSkill(blocks, { bin });
  return [
    '把下面这次 agent-desktop 桌面操作整理成一个可复用的 SKILL.md。',
    '',
    '要求：',
    `- 命令统一用绝对路径 \`${bin}\`；元素用 \`find --app/--role/--name\` 定位，ref 写 \`<ref>\` 占位。`,
    '- 只输出文件内容：YAML frontmatter（name 用 kebab-case，description 一句话写清做什么和触发词）加正文；不要用代码块包住整个文件，不要解释。',
    '- 正文按顺序写：# 标题、使用场景、## 执行循环、## 已验证的完整序列、## 输入参数、## 反模式。',
    '- 从对话和失败输出里提炼真实踩过的坑写进「反模式」；没发生过的不要编造，不确定的地方标「待确认」。',
    '- 中文书写，命令和界面元素名保持原文。',
    '',
    '<对话记录>',
    transcript(blocks),
    '</对话记录>',
    '',
    '<参考草稿>',
    draft.body,
    '</参考草稿>',
  ].join('\n');
}

/** 解析模型返回的 SKILL.md；没有 frontmatter 或正文时返回 null。 */
export function parseSkill(
  text: string
): { name?: string; description?: string; body: string } | null {
  const content = text
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n/, '')
    .replace(/\n```$/, '')
    .trim();
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) return null;
  const body = lines
    .slice(end + 1)
    .join('\n')
    .trim();
  if (!body) return null;
  const field = (key: string): string | undefined => {
    const line = lines.slice(1, end).find((item) => item.startsWith(`${key}:`));
    if (!line) return undefined;
    const value = line.slice(key.length + 1).trim();
    // 多行块（| / >）不是单值，留给原描述，避免把符号本身写进 skill。
    if (!value || value === '|' || value === '>') return undefined;
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // 不是 JSON 时按纯文本处理。
    }
    return value.replace(/^['"]|['"]$/g, '') || undefined;
  };
  return { name: field('name'), description: field('description'), body };
}

/** 技能列表里是否已有该 skill：id 通常等于目录名，name 来自 frontmatter。 */
export function isSkillLoaded(skills: { id: string; name: string }[], name: string): boolean {
  return skills.some((skill) => skill.id === name || skill.name === name);
}
