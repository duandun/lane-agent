import type { ReactNode } from 'react';
import { Button, Tag, Typography, App as AntdApp } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { TrajectoryRecord } from '../lib/trajectory';
import { formatBytes, formatClock, formatDuration, sanitizeJson } from '../lib/trajectory';
import JsonBlock from './JsonBlock';
import Markdown from './Markdown';

function formatTokens(record: TrajectoryRecord): string {
  const tokens = record.tokens;
  if (!tokens) return '—';
  return (
    `${tokens.input} in / ${tokens.output} out` +
    (tokens.reasoning ? ` / ${tokens.reasoning} reasoning` : '')
  );
}

function parseJson(text: string): unknown {
  const value = text.trim();
  if (!value || (value[0] !== '{' && value[0] !== '[')) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export default function TrajectoryInspector({
  record,
  onClose,
}: {
  record: TrajectoryRecord | null;
  onClose: () => void;
}) {
  const { message } = AntdApp.useApp();

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制');
    } catch {
      message.error('复制失败');
    }
  }

  const outputJson =
    record?.kind === 'tool' && record.output ? parseJson(record.output) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-(--line) pb-2">
        <span className="truncate text-sm font-semibold">
          {record ? (record.kind === 'step' ? '模型调用' : record.title) : '记录详情'}
        </span>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          aria-label="关闭详情"
          onClick={onClose}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto pt-3">
        {record && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <Metric label="标题" value={record.title} />
              <Metric label="状态" value={statusText(record)} />
              <Metric label="开始" value={formatClock(record.at)} />
              <Metric label="结束" value={formatClock(record.end)} />
              <Metric label="耗时" value={formatDuration(record.duration)} />
              {record.requestIndex !== undefined && (
                <Metric label="模型调用序号" value={`#${record.requestIndex}`} />
              )}
              {record.model && <Metric label="模型" value={record.model} />}
              {record.agent && <Metric label="Agent" value={record.agent} />}
              {record.kind === 'step' && (
                <Metric label="TTFT" value={formatDuration(record.ttft)} />
              )}
              {record.kind === 'step' && <Metric label="Tokens" value={formatTokens(record)} />}
              {record.cost !== undefined && (
                <Metric label="成本" value={`$${record.cost.toFixed(6)}`} />
              )}
              {record.cumulative && (
                <Metric
                  label="累计"
                  value={`${record.cumulative.tokens.input} in / ${record.cumulative.tokens.output} out · $${record.cumulative.cost.toFixed(4)}`}
                />
              )}
              {record.finish && <Metric label="结束原因" value={record.finish} />}
              {record.retry && <Metric label="重试" value={`第 ${record.retry.attempt} 次`} />}
            </div>

            {record.retry?.error && (
              <Section title="上次重试错误" onCopy={() => copy(record.retry!.error)}>
                <pre className="m-0 overflow-auto whitespace-pre-wrap rounded-lg bg-(--panel-2) p-3 text-xs">
                  {record.retry.error}
                </pre>
              </Section>
            )}

            {(record.kind === 'text' || record.kind === 'reasoning') && record.text && (
              <Section
                title={record.kind === 'reasoning' ? '思考内容' : '回复内容'}
                onCopy={() => copy(record.text ?? '')}
              >
                <div className="text-sm">
                  <Markdown text={record.text} />
                </div>
              </Section>
            )}

            {record.kind === 'tool' && (
              <>
                <Section
                  title="输入"
                  onCopy={
                    record.input
                      ? () => copy(JSON.stringify(sanitizeJson(record.input), null, 2))
                      : undefined
                  }
                >
                  {record.input !== undefined ? <JsonBlock value={record.input} /> : <Empty />}
                </Section>
                <Section
                  title="输出"
                  onCopy={record.output ? () => copy(record.output!) : undefined}
                >
                  {outputJson !== undefined ? (
                    <JsonBlock value={outputJson} maxHeight={360} />
                  ) : record.output ? (
                    <pre className="m-0 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-(--panel-2) p-3 font-mono text-[11px]">
                      {record.output}
                    </pre>
                  ) : (
                    <Empty />
                  )}
                </Section>
              </>
            )}

            {record.kind === 'user' && (
              <Section title="提问" onCopy={() => copy(record.text ?? '')}>
                <div className="whitespace-pre-wrap text-sm">{record.text}</div>
                {!!record.attachments?.length && (
                  <div className="mt-2 flex flex-col gap-1">
                    {record.attachments.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-2 rounded-md border border-(--line) bg-(--panel-2) px-2 py-1 text-xs"
                      >
                        <span className="truncate">{file.name}</span>
                        {file.image && <Tag className="m-0!">图片</Tag>}
                        <span className="ml-auto shrink-0 text-(--muted)">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {record.kind === 'compaction' && record.output && (
              <Section title="压缩摘要" onCopy={() => copy(record.output ?? '')}>
                <div className="whitespace-pre-wrap text-sm">{record.output}</div>
              </Section>
            )}

            {record.kind === 'context' && (
              <Section
                title="消息上下文"
                onCopy={() => copy(JSON.stringify(sanitizeJson(record.input), null, 2))}
              >
                <JsonBlock value={sanitizeJson(record.input)} maxHeight={480} />
              </Section>
            )}

            {record.kind === 'system' && record.text && (
              <Section title="内容" onCopy={() => copy(record.text ?? '')}>
                <div className="whitespace-pre-wrap text-sm">{record.text}</div>
              </Section>
            )}

            <Section
              title="原始 JSON"
              onCopy={() => copy(JSON.stringify(sanitizeJson(record), null, 2))}
            >
              <JsonBlock value={sanitizeJson(record)} maxHeight={320} />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function statusText(record: TrajectoryRecord): string {
  if (record.status === 'running') return '运行中';
  if (record.status === 'error') return '失败';
  if (record.status === 'interrupted') return '已中断';
  return '完成';
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-(--muted)">{label}</div>
      <div className="truncate text-(--text)" title={value}>
        {value}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  onCopy,
}: {
  title: string;
  children: ReactNode;
  onCopy?: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Typography.Text strong className="text-xs!">
          {title}
        </Typography.Text>
        {onCopy && (
          <Button type="link" size="small" className="px-1! text-xs!" onClick={onCopy}>
            复制
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="rounded-lg bg-(--panel-2) p-3 text-xs text-(--muted)">—</div>;
}
