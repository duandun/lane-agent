import { useState } from 'react';
import { Button } from 'antd';

const MAX_LINES = 12;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 只读 JSON 树：对象/数组可折叠，长字符串预览 12 行并可展开。 */
export default function JsonBlock({
  value,
  maxHeight = 280,
}: {
  value: unknown;
  maxHeight?: number;
}) {
  return (
    <div
      className="overflow-auto rounded-lg border border-(--line) bg-(--panel-2) p-3 font-mono text-[11px] leading-5"
      style={{ maxHeight }}
    >
      <Node value={value} depth={0} />
    </div>
  );
}

function Node({ value, depth }: { value: unknown; depth: number }) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null || value === undefined) {
    return <span className="text-(--muted)">{String(value)}</span>;
  }

  if (typeof value === 'string') {
    return <StringNode text={value} />;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-sky-400">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-(--muted)">[]</span>;
    return (
      <div>
        <Button
          type="link"
          size="small"
          className="h-4! px-0! font-mono text-[11px]!"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? '▾' : '▸'} [{value.length}]
        </Button>
        {open && (
          <div className="border-l border-(--line) pl-3">
            {value.map((item, index) => (
              <div key={index} className="flex gap-1">
                <span className="text-(--muted)">{index}:</span>
                <Node value={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (isObject(value)) {
    const keys = Object.keys(value);
    if (!keys.length) return <span className="text-(--muted)">{'{}'}</span>;
    return (
      <div>
        <Button
          type="link"
          size="small"
          className="h-4! px-0! font-mono text-[11px]!"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? '▾' : '▸'} {'{'}…{'}'}
        </Button>
        {open && (
          <div className="border-l border-(--line) pl-3">
            {keys.map((key) => (
              <div key={key} className="flex gap-1">
                <span className="text-violet-400">{key}:</span>
                <Node value={value[key]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

function StringNode({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const display = text.startsWith('data:') ? '<data URI 已省略>' : text;
  const lines = display.split('\n');
  const truncated = !open && lines.length > MAX_LINES;
  const shown = truncated ? lines.slice(0, MAX_LINES).join('\n') : display;

  return (
    <span className="break-all text-emerald-400">
      &quot;{shown}&quot;
      {truncated && (
        <Button
          type="link"
          size="small"
          className="h-4! px-1! text-[10px]!"
          onClick={() => setOpen(true)}
        >
          展开 {lines.length} 行
        </Button>
      )}
    </span>
  );
}
