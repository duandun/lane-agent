import { useEffect, useState } from 'react';
import { CodeIcon, LightningBoltIcon, MagicWandIcon } from '@radix-ui/react-icons';
import DisclosureRow from './DisclosureRow';
import Markdown from './Markdown';
import type { Block } from '../lib/blocks';

export type ActivityBlock = Extract<Block, { kind: 'reasoning' | 'tool' }>;

/**
 * 一轮运行中的思考和工具调用，折叠成单个「已处理」行。
 * active 时自动展开，运行结束后自动收起。
 */
export default function Activity({ blocks, active }: { blocks: ActivityBlock[]; active: boolean }) {
  const [open, setOpen] = useState(active);

  // 运行中展开，结束后折叠成一行。
  useEffect(() => {
    setOpen(active);
  }, [active]);

  const tools = blocks.filter((block) => block.kind === 'tool').length;
  const thinks = blocks.length - tools;
  const summary = [thinks ? `${thinks} 次思考` : '', tools ? `${tools} 个工具` : '']
    .filter(Boolean)
    .join(' · ');
  const failed = blocks.some((block) => block.kind === 'tool' && block.status === 'error');

  return (
    <DisclosureRow
      icon={<LightningBoltIcon />}
      title={active ? '处理中…' : '已处理'}
      preview={summary}
      status={active ? 'running' : failed ? 'error' : 'ok'}
      running={active}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      <div className="ml-2.5 flex w-full animate-[process-in_180ms_ease-out] flex-col gap-0.5 border-l border-(--line) pl-2 motion-reduce:animate-none">
        {blocks.map((block) => (
          <ProcessRow key={block.id} block={block} active={active} />
        ))}
      </div>
    </DisclosureRow>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 1) return `${Math.round(ms)}ms`;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest ? `${minutes}m${rest}s` : `${minutes}m`;
}

/** 活动组内的一条思考或工具调用。 */
function ProcessRow({ block, active }: { block: ActivityBlock; active: boolean }) {
  const [open, setOpen] = useState(false);
  const reasoning = block.kind === 'reasoning';
  const text = reasoning ? block.text : block.detail;
  const preview = text.trim().split('\n')[0] ?? '';

  return (
    <DisclosureRow
      icon={reasoning ? <MagicWandIcon /> : <CodeIcon />}
      title={
        reasoning
          ? block.duration != null
            ? `思考 ${formatDuration(block.duration)}`
            : '思考'
          : block.name
      }
      titleMono={!reasoning}
      preview={preview}
      previewMono={!reasoning}
      status={reasoning ? undefined : block.status}
      running={reasoning ? active : block.status === 'running'}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      {text && (
        <div
          className={`mt-0.5 mx-1.5 mb-1.5 ml-[27px] animate-[process-in_180ms_ease-out] text-(--text) motion-reduce:animate-none ${
            reasoning
              ? '[&_.markdown]:text-[13px]! text-[13px] leading-[1.7] [&_.markdown]:leading-[1.7]!'
              : 'max-h-[320px] overflow-auto whitespace-pre-wrap wrap-break-word rounded-md border border-(--line) bg-(--bg) p-2 font-mono text-xs leading-[1.6]'
          }`}
        >
          {reasoning ? <Markdown text={text} /> : text}
        </div>
      )}
    </DisclosureRow>
  );
}
