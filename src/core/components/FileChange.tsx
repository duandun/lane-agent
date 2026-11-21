import type { ReactNode } from 'react';
import { CheckCircledIcon, CrossCircledIcon, FileTextIcon } from '@radix-ui/react-icons';
import type { ToolStatus } from '../lib/blocks';
import { wordDiff, type FileDiff, type Segment } from '../lib/diff';

/**
 * 文件改动卡片：头部显示文件名和增删行数，正文按 git 的方式高亮改动行，
 * 替换的行做词级对比（删除划红线、新增绿底）。
 */
export default function FileChange({ diff, status }: { diff: FileDiff; status: ToolStatus }) {
  const name = diff.path.split(/[\\/]/).pop() || diff.path;

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-(--line) bg-(--panel)">
      <div className="flex items-center gap-2 border-b border-(--line) px-3.5 py-2.5 text-[13px]">
        <FileTextIcon className="shrink-0 text-(--muted)" />
        <span className="min-w-0 flex-1 truncate font-mono text-(--text)" title={diff.path}>
          {name}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-xs">
          {status === 'ok' && <CheckCircledIcon className="text-(--ok)" />}
          {status === 'error' && <CrossCircledIcon className="text-(--err)" />}
          {status === 'running' && <span className="text-(--accent)">运行中</span>}
          <span className="text-[#2ea043]">+{diff.added}</span>
          {diff.removed > 0 && <span className="text-[#f85149]">−{diff.removed}</span>}
        </span>
      </div>
      <div className="max-h-[360px] overflow-auto px-3 py-2 font-mono text-xs leading-[1.7]">
        <DiffRows diff={diff} />
      </div>
    </div>
  );
}

/** 把 diff 行成对地渲染：相邻的删除/新增行做词级对比，其余整行着色。 */
function DiffRows({ diff }: { diff: FileDiff }) {
  const rows: ReactNode[] = [];
  const lines = diff.lines;

  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (line.type === 'del') {
      let delEnd = i;
      while (lines[delEnd]?.type === 'del') delEnd++;
      let addEnd = delEnd;
      while (lines[addEnd]?.type === 'add') addEnd++;
      const dels = lines.slice(i, delEnd);
      const adds = lines.slice(delEnd, addEnd);
      const pairs = Math.min(dels.length, adds.length);

      for (let k = 0; k < pairs; k++) {
        const words = wordDiff(dels[k].text, adds[k].text);
        rows.push(<Row key={`${i}-${k}-`} segments={words.del} tone="del" />);
        rows.push(<Row key={`${i}-${k}+`} segments={words.add} tone="add" />);
      }
      for (let k = pairs; k < dels.length; k++) {
        rows.push(
          <Row key={`${i}-${k}-`} segments={[{ text: dels[k].text, changed: true }]} tone="del" />
        );
      }
      for (let k = pairs; k < adds.length; k++) {
        rows.push(
          <Row key={`${i}-${k}+`} segments={[{ text: adds[k].text, changed: true }]} tone="add" />
        );
      }
      i = addEnd;
      continue;
    }

    if (line.type === 'add') {
      rows.push(<Row key={i} segments={[{ text: line.text, changed: true }]} tone="add" />);
    } else {
      rows.push(<Row key={i} segments={[{ text: line.text, changed: false }]} tone="ctx" />);
    }
    i++;
  }

  return <>{rows}</>;
}

function Row({ segments, tone }: { segments: Segment[]; tone: 'add' | 'del' | 'ctx' }) {
  const background =
    tone === 'add'
      ? 'bg-[rgba(46,160,67,0.10)]'
      : tone === 'del'
        ? 'bg-[rgba(248,81,73,0.10)]'
        : '';
  const empty = segments.every((seg) => !seg.text);

  return (
    <div className={`min-h-[1.4em] whitespace-pre ${background}`}>
      {empty
        ? ' '
        : segments.map((seg, index) =>
            seg.changed ? (
              <span
                key={index}
                className={
                  tone === 'del'
                    ? 'bg-[rgba(248,81,73,0.22)] text-[#f85149] line-through'
                    : 'bg-[rgba(46,160,67,0.22)]'
                }
              >
                {seg.text}
              </span>
            ) : (
              <span key={index}>{seg.text}</span>
            )
          )}
    </div>
  );
}
