import { useState } from 'react';
import { DotsHorizontalIcon, Pencil2Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import {
  AlertDialog,
  Button,
  Dialog,
  DropdownMenu,
  Flex,
  IconButton,
  Text,
  TextField,
} from '@radix-ui/themes';
import type { SessionInfo } from '@opencode/client';

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
  // 菜单打开期间保持该行的选中态，指针移到菜单里也不会掉。
  const [openMenuID, setOpenMenuID] = useState<string | null>(null);

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
    await onDelete(deleting.id);
    setDeleting(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-(--panel)">
      <div className="p-2.5">
        <Button
          variant="soft"
          color="gray"
          disabled={busy}
          onClick={onNew}
          style={{ width: '100%' }}
        >
          <Flex align="center" gap="1">
            <PlusIcon />
            新会话
          </Flex>
        </Button>
      </div>
      <div className="px-3 pb-1">
        <Text size="1" color="gray">
          历史会话
        </Text>
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {sessions.map((session) => {
          const active = session.id === current;
          const locked = busy && !active;
          // 正在跑的当前会话不能删也不能改名。
          const actionsDisabled = busy && active;
          // 当前会话、菜单打开时都是选中态。
          const selected = active || openMenuID === session.id;
          return (
            <div
              key={session.id}
              className={`group relative rounded-md ${
                selected ? 'bg-(--panel-2)' : 'hover:bg-(--panel-2)'
              }`}
            >
              <Button
                variant="ghost"
                color="gray"
                disabled={locked}
                title={locked ? '当前这轮还没跑完' : undefined}
                onClick={() => onSelect(session.id)}
                className={`m-0! box-border! h-auto! w-full! justify-start! rounded-md! px-2! py-1.5! text-left! [font:inherit]! hover:bg-transparent! ${
                  locked ? 'opacity-50!' : ''
                }`}
              >
                <Flex align="center" gap="2" className="w-full min-w-0">
                  <Text
                    size="2"
                    truncate
                    className="min-w-0 flex-1"
                    style={{ color: selected ? 'var(--text)' : 'var(--muted)' }}
                  >
                    {session.title?.trim() || '未命名会话'}
                  </Text>
                  <Text
                    size="1"
                    color="gray"
                    className={`shrink-0 transition-opacity opacity-100 group-hover:opacity-0 max-sm:opacity-0`}
                  >
                    {timeAgo(session.time.updated || session.time.created)}
                  </Text>
                </Flex>
              </Button>
              <DropdownMenu.Root
                open={openMenuID === session.id}
                onOpenChange={(open) =>
                  setOpenMenuID((id) => (open ? session.id : id === session.id ? null : id))
                }
              >
                <DropdownMenu.Trigger>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    disabled={actionsDisabled}
                    aria-label="会话操作"
                    className={`absolute! top-1/2! right-1! m-0! -translate-y-1/2! transition-opacity opacity-0! group-hover:opacity-100! max-sm:opacity-100!`}
                  >
                    <DotsHorizontalIcon />
                  </IconButton>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content side="right" align="start">
                  <DropdownMenu.Item
                    disabled={actionsDisabled}
                    onSelect={() => startRename(session)}
                  >
                    <Pencil2Icon />
                    重命名
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    color="red"
                    disabled={actionsDisabled}
                    onSelect={() => setDeleting(session)}
                  >
                    <TrashIcon />
                    删除
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>
          );
        })}
        {!sessions.length && (
          <div className="px-2 py-6 text-center">
            <Text size="1" color="gray">
              还没有会话
            </Text>
          </div>
        )}
      </div>

      <Dialog.Root
        open={!!renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <Dialog.Content maxWidth="400px" aria-describedby={undefined}>
          <Dialog.Title>重命名会话</Dialog.Title>
          <Flex direction="column" gap="3" mt="3">
            <TextField.Root
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitRename();
              }}
              maxLength={60}
              autoFocus
              placeholder="会话标题"
            />
          </Flex>
          <Flex justify="end" gap="2" mt="4">
            <Button variant="soft" color="gray" onClick={() => setRenaming(null)}>
              取消
            </Button>
            <Button loading={saving} disabled={!title.trim()} onClick={() => void submitRename()}>
              保存
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      <AlertDialog.Root
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialog.Content maxWidth="400px">
          <AlertDialog.Title>删除会话</AlertDialog.Title>
          <AlertDialog.Description size="2">
            「{deleting?.title?.trim() || '未命名会话'}」及其全部消息会被删除，无法恢复。
          </AlertDialog.Description>
          <Flex justify="end" gap="2" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                取消
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button color="red" onClick={() => void submitDelete()}>
                删除
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
}
