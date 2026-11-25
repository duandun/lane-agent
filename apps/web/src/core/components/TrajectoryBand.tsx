import { useLayoutEffect, useRef } from 'react';
import { Tooltip } from 'antd';
import type { TrajectoryKind, TrajectoryRecord } from '../lib/trajectory';
import { formatClock, formatDuration } from '../lib/trajectory';

const WIDTH = 18;
const HEIGHT = 14;
const GAP = 4;

const KIND_LABEL: Record<TrajectoryRecord['kind'], string> = {
  user: '用户',
  context: '输入上下文',
  step: '模型调用',
  text: '回复',
  reasoning: '思考',
  tool: '工具',
  compaction: '上下文压缩',
  system: '系统',
};

const LANES: { key: string; label: string; kinds: TrajectoryKind[] }[] = [
  { key: 'input', label: '输入', kinds: ['user', 'context'] },
  { key: 'model', label: '模型', kinds: ['step', 'text', 'reasoning', 'compaction'] },
  { key: 'tool', label: '工具', kinds: ['tool', 'system'] },
];

function segmentColor(record: TrajectoryRecord): string {
  if (record.kind === 'user') return 'bg-(--muted)';
  if (record.kind === 'context') return 'bg-teal-400';
  if (record.kind === 'step') return 'bg-(--accent)';
  if (record.kind === 'text') return 'bg-sky-500';
  if (record.kind === 'reasoning') return 'bg-violet-400';
  if (record.kind === 'compaction' || record.kind === 'system') return 'bg-slate-500';
  if (record.status === 'error') return 'bg-red-500';
  if (record.status === 'running') return 'bg-amber-400';
  return 'bg-emerald-500';
}

/**
 * 输入 / 模型 / 工具三条泳道共享同一条记录顺序轴：每一列是一个全局记录，
 * 某层没有对应记录时留空，横向读就是先后顺序。标记是 18×12px 的圆角长方形。
 */
export default function TrajectoryBand({
  records,
  selectedId,
  onSelect,
}: {
  records: TrajectoryRecord[];
  selectedId?: string | null;
  onSelect: (record: TrajectoryRecord) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 所有记录都占一列，系统操作也进入工具泳道，保证顺序轴完整。
  const visible = records;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [visible.length]);

  return (
    <div className="mx-1 my-2 shrink-0 rounded-lg border border-(--line) bg-(--panel-2) px-2 pb-2.5 pt-2">
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 flex-col gap-1">
          {LANES.map((lane) => (
            <span key={lane.key} className="h-3.5 w-8 text-[10px] leading-3.5 text-(--muted)">
              {lane.label}
            </span>
          ))}
        </div>
        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-x-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {visible.length === 0 ? (
            <span className="text-[10px] text-(--muted)">—</span>
          ) : (
            <div
              className="grid gap-[4px]"
              style={{
                gridTemplateColumns: `repeat(${visible.length}, ${WIDTH}px)`,
                gridAutoRows: `${HEIGHT}px`,
              }}
            >
              {LANES.map((lane) =>
                visible.map((record) => (
                  <div
                    key={`${lane.key}:${record.id}`}
                    className="flex h-3.5 w-[18px] items-center"
                  >
                    {lane.kinds.includes(record.kind) && (
                      <Segment
                        record={record}
                        selected={selectedId === record.id}
                        onSelect={onSelect}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Segment({
  record,
  selected,
  onSelect,
}: {
  record: TrajectoryRecord;
  selected: boolean;
  onSelect: (record: TrajectoryRecord) => void;
}) {
  return (
    <Tooltip
      mouseEnterDelay={0.5}
      title={
        <div className="text-xs">
          <div className="font-semibold">
            {KIND_LABEL[record.kind]} · {record.title}
          </div>
          <div>开始 {formatClock(record.at)}</div>
          <div>耗时 {formatDuration(record.duration)}</div>
          {record.kind === 'step' && (
            <div>
              TTFT {formatDuration(record.ttft)}
              {record.tokens ? ` · ${record.tokens.input} in / ${record.tokens.output} out` : ''}
            </div>
          )}
        </div>
      }
    >
      <button
        type="button"
        aria-label={`${KIND_LABEL[record.kind]} ${record.title}`}
        onClick={() => onSelect(record)}
        className={`block h-3.5 w-[18px] cursor-pointer rounded-[3px] border-0 p-0 ${segmentColor(record)} ${
          selected ? 'border-1' : ''
        }`}
      />
    </Tooltip>
  );
}
