import { useState } from 'react';
import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { SessionInfo } from '@opencode/client';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { DropdownMenu, type DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { HStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';

/** 会话更新时间：窄侧栏里用短格式。 */
function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 时`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天`;
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
  const [renaming, setRenaming] = useState<SessionInfo | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SessionInfo | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  function startRename(session: SessionInfo) {
    setRenaming(session);
    setTitle(session.title?.trim() || '');
  }

  async function submitRename() {
    const value = title.trim().slice(0, 60);
    if (!renaming || !value) return;
    setSaving(true);
    try {
      await onRename(renaming.id, value);
      setRenaming(null);
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete() {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await onDelete(deleting.id);
      setDeleting(null);
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <>
      <SideNav
        topContent={
          <Button
            label="新会话"
            variant="secondary"
            width="100%"
            isDisabled={busy}
            onClick={onNew}
          />
        }
      >
        <SideNavSection title="历史会话">
          {sessions.length ? (
            sessions.map((session) => {
              const active = session.id === current;
              const locked = busy && !active;
              // 正在跑的当前会话不能删也不能改名。
              const actionsDisabled = busy && active;
              const items: DropdownMenuOption[] = [
                {
                  label: '重命名',
                  icon: PencilSquareIcon,
                  isDisabled: actionsDisabled,
                  onClick: () => startRename(session),
                },
                { type: 'divider' },
                {
                  label: '删除',
                  icon: TrashIcon,
                  variant: 'destructive',
                  isDisabled: actionsDisabled,
                  onClick: () => setDeleting(session),
                },
              ];

              return (
                <SideNavItem
                  key={session.id}
                  label={session.title?.trim() || '未命名会话'}
                  isSelected={active}
                  isDisabled={locked}
                  onClick={() => onSelect(session.id)}
                  actions={
                    <span className="session-meta">
                      <span className="session-time">
                        <Text type="supporting" color="secondary">
                          {timeAgo(session.time.updated || session.time.created)}
                        </Text>
                      </span>
                      <DropdownMenu
                        renderTrigger={(props) => (
                          <IconButton
                            {...props}
                            className="session-actions"
                            label="会话操作"
                            tooltip="会话操作"
                            icon={<Icon icon="moreHorizontal" />}
                            variant="ghost"
                            size="sm"
                          />
                        )}
                        placement="end"
                        alignment="start"
                        items={items}
                      />
                    </span>
                  }
                />
              );
            })
          ) : (
            <Text type="supporting" color="secondary">
              还没有会话
            </Text>
          )}
        </SideNavSection>
      </SideNav>

      <Dialog
        isOpen={!!renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        purpose="form"
        width={400}
      >
        <Layout
          header={<DialogHeader title="重命名会话" onOpenChange={() => setRenaming(null)} />}
          content={
            <LayoutContent>
              <TextInput
                label="会话标题"
                value={title}
                onChange={setTitle}
                onEnter={() => void submitRename()}
                hasAutoFocus
                placeholder="会话标题"
              />
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button label="取消" onClick={() => setRenaming(null)} />
                <Button
                  label="保存"
                  variant="primary"
                  isDisabled={!title.trim()}
                  isLoading={saving}
                  onClick={() => void submitRename()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      <AlertDialog
        isOpen={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="删除会话"
        description={
          deleting
            ? `「${deleting.title?.trim() || '未命名会话'}」及其全部消息会被删除，无法恢复。`
            : ''
        }
        actionLabel="删除"
        cancelLabel="取消"
        isActionLoading={deletePending}
        onAction={() => void submitDelete()}
      />
    </>
  );
}
