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

    if (block.status === 'error') {
      if (args.match(REF_RE)?.some((ref) => !refs.has(ref))) unresolved += 1;
      pitfalls.push(`- 上次失败的命令：\`${bin} ${args}\`（输出：${block.detail.trim().slice(0, 200)}）`);
      continue;
    }

    if (/^snapshot\b/.test(args)) {
      steps.push(`观察当前界面：\`${bin} ${args}\``);
      continue;
    }

    const matches = [...args.matchAll(REF_RE)];
    if (!matches.length) {
      steps.push(`执行：\`${bin} ${args}\``);
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
      steps.push(`定位「${label}」：\`${find.join(' ')}\`，再执行 \`${bin} ${action}\``);
    } else {
      steps.push(`执行：\`${bin} ${action}\`（原 ref 无法还原，请手动确认定位方式）`);
    }
  }

  if (unresolved) {
    warnings.push(`${unresolved} 个元素无法从 snapshot 输出中还原，已用 <ref> 占位。`);
  }

  const app = scopeApp;
  const name = opts.name ?? slugify(app) ?? `desktop-task-${today()}`;
  const userText = firstUserText(blocks);
  const description =
    opts.description ??
    (userText || `在 ${app ?? '桌面应用'} 中完成一次操作。`).slice(0, 200);

  const body = [
    `# ${app ? `${app} 操作` : '桌面操作'}`,
    '',
    `前置：${app ? `确保 ${app} 已打开，` : ''}界面处于操作开始前的状态。`,
    '',
    '## 步骤',
    '',
    steps.length ? steps.map((step, index) => `${index + 1}. ${step}`).join('\n') : '1. 重新观察目标应用后再执行。',
    '',
    '## 验证',
    '',
    '重新 snapshot 或对目标元素执行 `is` / `get` 检查，确认结果符合预期；涉及文件时确认文件存在且内容正确。',
    '',
    '## 参数',
    '',
    params.size ? [...params].join('\n') : '- 无显式参数；需要时直接修改上面的命令。',
    '',
    '## 错误处理',
    '',
    '- `STALE_REF` / `AMBIGUOUS_TARGET`：重新 snapshot 或 find 定位，不复用旧 ref。',
    '- 只有 `error.disposition.retry === "safe"` 才重试；其余先读取当前状态再决定。',
    pitfalls.length ? `\n### 已知坑\n\n${pitfalls.join('\n')}` : '',
  ]
    .join('\n')
    .trimEnd();

  return { name, description, body, steps: picked.length, warnings };
}
