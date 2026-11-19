import { diffLines as computeLineChanges, diffWordsWithSpace } from 'diff';

export type DiffLine = { type: 'add' | 'del' | 'ctx'; text: string };

export type FileDiff = { path: string; lines: DiffLine[]; added: number; removed: number };

/** 超大输入直接整段替换，避免 diff 卡住界面。 */
const MAX_TEXT_LENGTH = 400_000;
const MAX_WORD_LENGTH = 8_000;
const MAX_LINES = 400;

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** 按行拆分，去掉末尾换行拆出来的空串。 */
function rawLines(text: string): string[] {
  if (!text) return [];
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/** 逐行比较，输出带增删标记的行。 */
function diffLines(oldText: string, newText: string): DiffLine[] {
  if (oldText.length + newText.length > MAX_TEXT_LENGTH) {
    return [
      ...rawLines(oldText).map((text): DiffLine => ({ type: 'del', text })),
      ...rawLines(newText).map((text): DiffLine => ({ type: 'add', text })),
    ];
  }

  const lines: DiffLine[] = [];
  for (const change of computeLineChanges(oldText, newText, { ignoreNewlineAtEof: true }) ?? []) {
    const type: DiffLine['type'] = change.added ? 'add' : change.removed ? 'del' : 'ctx';
    for (const text of rawLines(change.value)) lines.push({ type, text });
  }
  return lines;
}

/** 直接解析 unified patch 文本（+/-/空格 开头的行）。 */
function patchLines(text: string): DiffLine[] {
  return text.split('\n').map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++'))
      return { type: 'add', text: line.slice(1) };
    if (line.startsWith('-') && !line.startsWith('---'))
      return { type: 'del', text: line.slice(1) };
    return { type: 'ctx', text: line };
  });
}

function patchPath(text: string): string {
  const match = text.match(/^\+\+\+\s+b?(\S+)/m) ?? text.match(/^\*\*\* Update File:\s*(.+)$/m);
  return match?.[1]?.trim() ?? '变更';
}

function build(path: string, lines: DiffLine[]): FileDiff | null {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === 'add') added++;
    if (line.type === 'del') removed++;
  }
  // 内容没变（例如只有行尾换行差异）时不生成卡片。
  if (!added && !removed) return null;
  const shown =
    lines.length > MAX_LINES
      ? [
          ...lines.slice(0, MAX_LINES),
          { type: 'ctx' as const, text: `…… 仅展示前 ${MAX_LINES} 行，共 ${lines.length} 行` },
        ]
      : lines;
  return { path, lines: shown, added, removed };
}

export type Segment = { text: string; changed: boolean };

/**
 * 逐词比较两行，供行内高亮使用；`changed` 表示该片段是新增或删除的部分。
 */
export function wordDiff(oldLine: string, newLine: string): { del: Segment[]; add: Segment[] } {
  if (oldLine.length + newLine.length > MAX_WORD_LENGTH) {
    return {
      del: oldLine ? [{ text: oldLine, changed: true }] : [],
      add: newLine ? [{ text: newLine, changed: true }] : [],
    };
  }

  const del: Segment[] = [];
  const add: Segment[] = [];
  const push = (list: Segment[], text: string, changed: boolean) => {
    const last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };

  for (const change of diffWordsWithSpace(oldLine, newLine) ?? []) {
    if (change.removed) {
      push(del, change.value, true);
    } else if (change.added) {
      push(add, change.value, true);
    } else {
      push(del, change.value, false);
      push(add, change.value, false);
    }
  }
  return { del, add };
}

/** 从工具名和输入提取文件改动；不是改文件的工具返回 null。
 * 支持 edit / write / patch，字段名同时兼容 camelCase 和 snake_case。
 */
export function toolFileDiff(name: string, input: unknown): FileDiff | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const path = str(value.filePath) ?? str(value.file_path) ?? str(value.path) ?? '';

  if (name === 'edit') {
    const oldText = str(value.oldString) ?? str(value.old_string);
    const newText = str(value.newString) ?? str(value.new_string);
    if (oldText === undefined && newText === undefined) return null;
    return build(path || '文件', diffLines(oldText ?? '', newText ?? ''));
  }

  if (name === 'write') {
    const content = str(value.content);
    if (content === undefined || !path) return null;
    return build(path, diffLines('', content));
  }

  const patchText = str(value.patchText) ?? str(value.patch);
  if (patchText && (name === 'patch' || name === 'apply_patch')) {
    return build(path || patchPath(patchText), patchLines(patchText));
  }

  return null;
}
