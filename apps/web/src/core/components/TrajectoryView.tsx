import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Input, Segmented, Spin, Tag, Typography } from 'antd';
import {
  CheckOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DownOutlined,
  FileTextOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  RightOutlined,
  RobotOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Client } from '../lib/client';
import type { Block, StepInfo } from '../lib/blocks';
import { useTrajectory } from '../hooks/useTrajectory';
import {
  formatClock,
  formatDuration,
  type TrajectoryRecord,
  type TrajectoryTurn,
} from '../lib/trajectory';
import TrajectoryBand from './TrajectoryBand';
import TrajectoryInspector from './TrajectoryInspector';

type Mode = 'overview' | 'detail';

type Row =
  | { type: 'load' }
  | { type: 'turn'; turn: TrajectoryTurn }
  | { type: 'record'; record: TrajectoryRecord };

const KIND_META: Record<TrajectoryRecord['kind'], { label: string; icon: ReactNode }> = {
  user: { label: '用户', icon: <UserOutlined /> },
  context: { label: '输入上下文', icon: <DatabaseOutlined /> },
  step: { label: '模型调用', icon: <RobotOutlined /> },
  text: { label: '回复', icon: <FileTextOutlined /> },
  reasoning: { label: '思考', icon: <CheckOutlined /> },
  tool: { label: '工具', icon: <CodeOutlined /> },
  compaction: { label: '上下文压缩', icon: <FolderOutlined /> },
  system: { label: '系统', icon: <InfoCircleOutlined /> },
};

function rowKey(row: Row): string {
  if (row.type === 'load') return 'load';
  if (row.type === 'turn') return row.turn.id;
  return row.record.id;
}

function estimateRow(row: Row): number {
  if (row.type === 'load') return 34;
  if (row.type === 'turn') return 28;
  if (row.record.kind === 'step') return 32;
  return 44;
}

function statusColor(status: TrajectoryRecord['status']): string {
  if (status === 'error') return 'text-red-500';
  if (status === 'interrupted') return 'text-orange-500';
  if (status === 'running') return 'text-amber-500';
  return 'text-emerald-500';
}

function statusLabel(status: TrajectoryRecord['status']): string {
  if (status === 'error') return '失败';
  if (status === 'interrupted') return '已中断';
  if (status === 'running') return '运行中';
  return '完成';
}

function matches(record: TrajectoryRecord, query: string): boolean {
  if (!query) return false;
  const haystack = `${record.title} ${record.preview} ${KIND_META[record.kind].label} ${record.status}`;
  return haystack.toLowerCase().includes(query);
}

/**
 * 对话轨迹：固定宽度轨迹带 + 虚拟滚动的轮次/步骤账本 + 记录检查器。
 */
export default function TrajectoryView({
  client,
  sessionID,
  blocks,
  steps,
  busy,
  revision,
}: {
  client: Client;
  sessionID: string | null;
  blocks: Block[];
  steps: Record<string, StepInfo>;
  busy: boolean;
  revision: number;
}) {
  const { trajectory, messages, ready, hasMore, loadingOlder, loadOlder } = useTrajectory({
    client,
    sessionID,
    blocks,
    steps,
    busy,
    revision,
  });

  const [mode, setMode] = useState<Mode>('overview');
  const [query, setQuery] = useState('');
  const [collapsedTurns, setCollapsedTurns] = useState<Set<string>>(new Set());
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stick, setStick] = useState(true);
  const [revealId, setRevealId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const beforeLoadRef = useRef<{ height: number; top: number } | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const rows = useMemo(() => {
    const list: Row[] = [];
    if (hasMore && !normalizedQuery) list.push({ type: 'load' });

    for (const turn of trajectory.turns) {
      if (!normalizedQuery) {
        list.push({ type: 'turn', turn });
        if (collapsedTurns.has(turn.id)) continue;
        let hiddenStep: string | null = null;
        for (const record of turn.records) {
          if (record.kind === 'step') {
            hiddenStep = collapsedSteps.has(record.id) ? record.id : null;
            list.push({ type: 'record', record });
            continue;
          }
          if (hiddenStep) continue;
          list.push({ type: 'record', record });
        }
        continue;
      }

      // 搜索模式：只保留命中记录和它们的 step / 轮次祖先。
      const matching = turn.records.map((record) => matches(record, normalizedQuery));
      let any = false;
      const turnRows: Row[] = [];
      for (let index = 0; index < turn.records.length; index += 1) {
        const record = turn.records[index];
        if (matching[index]) {
          turnRows.push({ type: 'record', record });
          any = true;
          continue;
        }
        if (record.kind === 'step') {
          // step 自身没命中，但子记录命中时保留祖先。
          let childMatch = false;
          for (let next = index + 1; next < turn.records.length; next += 1) {
            const child = turn.records[next];
            if (child.kind === 'step') break;
            if (matching[next]) {
              childMatch = true;
              break;
            }
          }
          if (childMatch) {
            turnRows.push({ type: 'record', record });
            any = true;
          }
        }
      }
      if (any) {
        list.push({ type: 'turn', turn });
        list.push(...turnRows);
      }
    }
    return list;
  }, [trajectory, collapsedTurns, collapsedSteps, normalizedQuery, hasMore]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateRow(rows[index]),
    overscan: 8,
    getItemKey: (index) => rowKey(rows[index]),
  });

  // 跟随尾部；用户向上滚动时暂停。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !stick) return;
    el.scrollTop = el.scrollHeight;
  }, [rows.length, stick, busy]);

  // 加载更早页面后按插入高度修正滚动位置。
  useLayoutEffect(() => {
    const before = beforeLoadRef.current;
    if (!before) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = before.top + (el.scrollHeight - before.height);
    beforeLoadRef.current = null;
  }, [messages.length]);

  useEffect(() => {
    if (!revealId) return;
    const index = rows.findIndex((row) => row.type === 'record' && row.record.id === revealId);
    if (index < 0) return;
    virtualizer.scrollToIndex(index, { align: 'center' });
    setRevealId(null);
  }, [rows, revealId, virtualizer]);

  function selectRecord(record: TrajectoryRecord) {
    setSelectedId(record.id);
    setRevealId(record.id);
    if (!rows.some((row) => row.type === 'record' && row.record.id === record.id)) {
      // 被折叠或搜索隐藏时，先还原视图再定位。
      setCollapsedSteps(new Set());
      setCollapsedTurns(new Set());
      setQuery('');
    }
  }

  async function handleLoadOlder() {
    const el = scrollRef.current;
    if (el) beforeLoadRef.current = { height: el.scrollHeight, top: el.scrollTop };
    await loadOlder();
  }

  function expandAll() {
    setCollapsedSteps(new Set());
    setCollapsedTurns(new Set());
  }

  function collapseAll() {
    setCollapsedTurns(new Set(trajectory.turns.map((turn) => turn.id)));
    setCollapsedSteps(
      new Set(
        trajectory.records.filter((record) => record.kind === 'step').map((record) => record.id)
      )
    );
  }

  // 用 id 而不是对象快照，流式更新后检查器能跟着刷新。
  const selected = useMemo(
    () => trajectory.records.find((record) => record.id === selectedId) ?? null,
    [trajectory, selectedId]
  );

  const stepCount = trajectory.records.filter((record) => record.kind === 'step').length;
  const toolCount = trajectory.records.filter((record) => record.kind === 'tool').length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-(--line) px-1 pb-2">
        <div className="flex items-center gap-2">
          <Typography.Text strong>对话轨迹</Typography.Text>
          <Typography.Text type="secondary" className="text-xs!">
            {trajectory.turns.length} 轮 · {stepCount} 次模型调用 · {toolCount} 个工具
          </Typography.Text>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            size="small"
            allowClear
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            prefix={<SearchOutlined />}
            placeholder="搜索轨迹"
            className="w-[180px]!"
          />
          <Button size="small" onClick={expandAll}>
            展开全部
          </Button>
          <Button size="small" onClick={collapseAll}>
            折叠全部
          </Button>
          <Segmented<Mode>
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { label: '概览', value: 'overview' },
              { label: '详细', value: 'detail' },
            ]}
          />
        </div>
      </div>

      <TrajectoryBand
        records={trajectory.records}
        selectedId={selectedId}
        onSelect={selectRecord}
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className="relative min-h-0 flex-1 overflow-auto px-1 pb-2"
            onScroll={(event) => {
              const el = event.currentTarget;
              setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
            }}
          >
            {!ready ? (
              <div className="flex h-full items-center justify-center">
                <Spin />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-(--muted)">
                {normalizedQuery ? '没有匹配的记录' : '还没有对话记录'}
              </div>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((item) => {
                  const row = rows[item.index];
                  return (
                    <div
                      key={item.key}
                      data-index={item.index}
                      ref={virtualizer.measureElement}
                      className="pb-2"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      {row.type === 'load' ? (
                        <div className="px-2 py-1">
                          <Button
                            size="small"
                            type="link"
                            loading={loadingOlder}
                            onClick={() => void handleLoadOlder()}
                          >
                            加载更早记录
                          </Button>
                        </div>
                      ) : row.type === 'turn' ? (
                        <TurnHeader
                          turn={row.turn}
                          collapsed={collapsedTurns.has(row.turn.id)}
                          onToggle={() =>
                            setCollapsedTurns((current) => {
                              const next = new Set(current);
                              if (next.has(row.turn.id)) next.delete(row.turn.id);
                              else next.add(row.turn.id);
                              return next;
                            })
                          }
                        />
                      ) : (
                        <RecordRow
                          record={row.record}
                          mode={mode}
                          selected={selectedId === row.record.id}
                          collapsed={collapsedSteps.has(row.record.id)}
                          onSelect={() => setSelectedId(row.record.id)}
                          onToggle={() => {
                            setCollapsedSteps((current) => {
                              const next = new Set(current);
                              if (next.has(row.record.id)) next.delete(row.record.id);
                              else next.add(row.record.id);
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!stick && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
              <Button
                size="small"
                className="pointer-events-auto shadow"
                onClick={(evt) => {
                  evt.stopPropagation();
                  setStick(true);
                  const el = scrollRef.current;
                  if (el) el.scrollTop = el.scrollHeight;
                }}
              >
                回到最新
              </Button>
            </div>
          )}
        </div>

        {selected && (
          <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-[440px] flex-col border-l border-(--line) bg-(--bg) pl-3 pr-2 shadow-[-16px_0_32px_-24px_rgba(0,0,0,0.6)] max-lg:max-w-none lg:w-[420px]">
            <TrajectoryInspector record={selected} onClose={() => setSelectedId(null)} />
          </aside>
        )}
      </div>
    </div>
  );
}

function TurnHeader({
  turn,
  collapsed,
  onToggle,
}: {
  turn: TrajectoryTurn;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-(--muted)">
      <button
        type="button"
        className="border-0 bg-transparent p-0 text-(--muted) hover:text-(--text)"
        onClick={onToggle}
        aria-label={collapsed ? '展开轮次' : '折叠轮次'}
      >
        {collapsed ? <RightOutlined /> : <DownOutlined />}
      </button>
      <span className="font-semibold text-(--text)">第 {turn.index + 1} 轮</span>
      {turn.at && <span>{formatClock(turn.at)}</span>}
      <Typography.Text type="secondary" ellipsis className="max-w-[60%] text-xs!">
        {turn.preview}
      </Typography.Text>
    </div>
  );
}

function RecordRow({
  record,
  mode,
  selected,
  collapsed,
  onSelect,
  onToggle,
}: {
  record: TrajectoryRecord;
  mode: Mode;
  selected: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const isStep = record.kind === 'step';
  const detail = mode === 'detail';
  const meta = KIND_META[record.kind];
  const child = record.kind === 'reasoning' || record.kind === 'text' || record.kind === 'tool';
  const statusTag =
    record.status === 'ok' ? null : (
      <Tag
        color={
          record.status === 'error' ? 'red' : record.status === 'interrupted' ? 'orange' : 'gold'
        }
        className="m-0! shrink-0 text-[10px]!"
      >
        {statusLabel(record.status)}
      </Tag>
    );

  if (isStep) {
    return (
      <div
        className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
          selected ? 'bg-(--panel-2) ring-1 ring-(--accent) ring-inset' : 'hover:bg-(--panel-2)'
        }`}
      >
        <button
          type="button"
          className="border-0 bg-transparent p-0 text-(--muted) hover:text-(--text)"
          onClick={onToggle}
          aria-label={collapsed ? '展开模型调用' : '折叠模型调用'}
        >
          {collapsed ? <RightOutlined /> : <DownOutlined />}
        </button>
        <span
          className={`size-2 shrink-0 rounded-full ${
            record.status === 'error'
              ? 'bg-red-500'
              : record.status === 'interrupted'
                ? 'bg-orange-500'
                : record.status === 'running'
                  ? 'bg-amber-400'
                  : 'bg-(--accent)'
          }`}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 border-0 bg-transparent p-0 text-left text-inherit"
          onClick={onSelect}
        >
          <span className="font-semibold text-(--text)">{record.title}</span>
          {record.duration !== undefined && (
            <span className="text-[10px] text-(--muted)">{formatDuration(record.duration)}</span>
          )}
          {detail && record.model && (
            <span className="font-mono text-[10px] text-(--muted)">{record.model}</span>
          )}
          {detail && (
            <span className="text-[10px] text-(--muted)">TTFT {formatDuration(record.ttft)}</span>
          )}
          {detail && record.tokens && (
            <span className="text-[10px] text-(--muted)">
              {record.tokens.input} in / {record.tokens.output} out
            </span>
          )}
          {detail && record.cost !== undefined && (
            <span className="text-[10px] text-(--muted)">${record.cost.toFixed(4)}</span>
          )}
          {detail && record.at !== undefined && (
            <span className="text-[10px] text-(--muted)">{formatClock(record.at)}</span>
          )}
          {statusTag}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-(--line) bg-(--panel) px-3 py-2 text-xs transition-colors ${
        child ? 'ml-5' : ''
      } ${selected ? 'ring-1 ring-(--accent)' : 'hover:bg-(--panel-2)'}`}
    >
      <span className={`shrink-0 ${iconColor(record)}`}>{meta.icon}</span>
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 border-0 bg-transparent p-0 text-left text-inherit"
        onClick={onSelect}
      >
        <span className="shrink-0 font-medium text-(--text)">{record.title}</span>
        {record.preview && (
          <>
            <span className="shrink-0 text-(--muted)">·</span>
            <span className="truncate text-(--muted)">{record.preview}</span>
          </>
        )}
        {record.duration !== undefined && (
          <>
            <span className="shrink-0 text-(--muted)">·</span>
            <span className="shrink-0 text-[10px] text-(--muted)">
              {formatDuration(record.duration)}
            </span>
          </>
        )}
        {statusTag}
      </button>
    </div>
  );
}

function iconColor(record: TrajectoryRecord): string {
  if (record.kind === 'reasoning') return 'text-emerald-500';
  if (record.kind === 'text') return 'text-sky-500';
  if (record.kind === 'context') return 'text-teal-400';
  if (record.kind === 'tool') return statusColor(record.status);
  return 'text-(--muted)';
}
