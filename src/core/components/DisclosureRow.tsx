import type { ReactNode } from 'react';
import { CheckCircleFilled, CloseCircleFilled, DownOutlined } from '@ant-design/icons';

export type RowStatus = 'running' | 'ok' | 'error';

/**
 * DeepSeek Harness 风格的紧凑折叠行：图标、标题和折叠时的一行预览；
 * 点击头部展开内容。
 */
export default function DisclosureRow({
  icon,
  title,
  titleMono = false,
  preview,
  previewMono = false,
  status,
  running = false,
  open,
  onToggle,
  headClassName,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  titleMono?: boolean;
  preview?: string;
  previewMono?: boolean;
  status?: RowStatus;
  /** 文字从左到右高亮，用于处理中 / 思考 / 工具运行中。 */
  running?: boolean;
  open: boolean;
  onToggle: () => void;
  headClassName?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md">
      <button
        type="button"
        className={`flex min-h-[26px] w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1.5 py-0.5 text-left text-[13px] text-(--muted) [font:inherit] hover:bg-white/4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent) ${headClassName ?? ''}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="inline-flex shrink-0 text-[13px] text-(--muted)">{icon}</span>
        <span
          className={`shrink-0 ${running ? 'text-shimmer' : 'text-(--text)'} ${titleMono ? 'font-mono' : ''}`}
        >
          {title}
        </span>
        {!open && preview && (
          <span
            className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-(--muted) ${previewMono ? 'font-mono' : ''}`}
          >
            {preview}
          </span>
        )}
        {status && (
          <span
            className={`ml-auto inline-flex shrink-0 text-xs ${
              status === 'running'
                ? 'text-(--accent)'
                : status === 'ok'
                  ? 'text-(--ok)'
                  : 'text-(--err)'
            }`}
          >
            {status === 'ok' ? (
              <CheckCircleFilled />
            ) : status === 'error' ? (
              <CloseCircleFilled />
            ) : null}
          </span>
        )}
        <DownOutlined
          className={`shrink-0 text-[10px] text-(--muted) transition-transform duration-150 motion-reduce:transition-none ${
            open ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>
      {open && children}
    </div>
  );
}
