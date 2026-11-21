import { useState } from 'react';
import { App as AntdApp, Button, Dropdown, Input, Modal } from 'antd';
import { DeleteOutlined, EditOutlined, EllipsisOutlined, PlusOutlined } from '@ant-design/icons';
import type { SessionInfo } from '@opencode/client';

/** 会话更新时间：一周内用相对时间，更早显示日期。 */
function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const date = new Date(ms);
  return `${date.getMonth() + 1}-${date.getDate()}`;
}

/**
 * 左侧会话历史：新建会话 + 最近会话列表。
 * 桌面端常驻侧栏，窄屏放进 Drawer。
 */
export default function SessionList({
  sessions,
  current,
  busy,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  sessions: SessionInfo[];
  current: string | null;
  /** 一轮运行中不允许切走，避免同一个会话被并发驱动。 */
  busy: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { modal } = AntdApp.useApp();
  const [renaming, setRenaming] = useState<SessionInfo | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  // 菜单打开期间保持该行的选中态，指针移到菜单里也不会掉。
  const [openMenuID, setOpenMenuID] = useState<string | null>(null);

  function startRename(session: SessionInfo) {
    setRenaming(session);
    setTitle(session.title?.trim() || '');
  }

  async function submitRename() {
    const value = title.trim();
    if (!renaming || !value) return;
    setSaving(true);
    try {
      await onRename(renaming.id, value);
      setRenaming(null);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(session: SessionInfo) {
    modal.confirm({
      title: '删除会话',
      content: `「${session.title?.trim() || '未命名会话'}」及其全部消息会被删除，无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      onOk: () => onDelete(session.id),
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-(--panel)">
      <div className="p-2.5">
        <Button block icon={<PlusOutlined />} disabled={busy} onClick={onNew}>
          新会话
        </Button>
      </div>
      <div className="px-3 pb-1 text-[11px] text-(--muted)">历史会话</div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {sessions.map((session) => {
          const active = session.id === current;
          const locked = busy && !active;
          // 正在跑的当前会话不能删也不能改名。
          const actionsDisabled = busy && active;
          // 当前会话、悬停、菜单打开时都是选中态。
          const selected = active || openMenuID === session.id;
          return (
            <div key={session.id} className="group relative">
              <Button
                type="text"
                block
                disabled={locked}
                title={locked ? '当前这轮还没跑完' : undefined}
                onClick={() => onSelect(session.id)}
                className={`h-auto! rounded-md! py-1.5! pr-2! pl-2! text-left! transition-none! [font:inherit]! ${
                  selected ? 'bg-(--panel-2)!' : 'group-hover:bg-(--panel-2)!'
                } ${locked ? 'opacity-50!' : ''}`}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${selected ? 'text-(--text)' : 'text-(--muted)'}`}
                  >
                    {session.title?.trim() || '未命名会话'}
                  </span>
                  <span
                    className={`shrink-0 text-[11px] text-(--muted) ${
                      openMenuID === session.id
                        ? 'opacity-0'
                        : 'opacity-100 group-hover:opacity-0 group-focus-within:opacity-0 max-sm:opacity-0'
                    }`}
                  >
                    {timeAgo(session.time.updated || session.time.created)}
                  </span>
                </span>
              </Button>
              <Dropdown
                trigger={['click']}
                disabled={actionsDisabled}
                open={openMenuID === session.id}
                onOpenChange={(open) =>
                  setOpenMenuID((id) => (open ? session.id : id === session.id ? null : id))
                }
                menu={{
                  items: [
                    { key: 'rename', label: '重命名', icon: <EditOutlined /> },
                    {
                      key: 'delete',
                      label: '删除',
                      icon: <DeleteOutlined />,
                      danger: true,
                    },
                  ],
                  onClick: ({ key }) => {
                    if (key === 'rename') startRename(session);
                    if (key === 'delete') confirmDelete(session);
                  },
                }}
              >
                <Button
                  type="text"
                  size="small"
                  title="会话操作"
                  className={`absolute! top-1/2 right-1 -translate-y-1/2 focus-visible:opacity-100! max-sm:opacity-100! ${
                    openMenuID === session.id
                      ? 'opacity-100!'
                      : 'opacity-0! group-hover:opacity-100! group-focus-within:opacity-100!'
                  }`}
                  icon={<EllipsisOutlined />}
                />
              </Dropdown>
            </div>
          );
        })}
        {!sessions.length && (
          <div className="px-2 py-6 text-center text-xs text-(--muted)">还没有会话</div>
        )}
      </div>

      <Modal
        title="重命名会话"
        open={!!renaming}
        centered
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => void submitRename()}
        onCancel={() => setRenaming(null)}
        destroyOnHidden
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onPressEnter={() => void submitRename()}
          maxLength={60}
          autoFocus
          placeholder="会话标题"
        />
      </Modal>
    </div>
  );
}
