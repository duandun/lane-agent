import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Sender } from '@ant-design/x';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Cross2Icon,
  DesktopIcon,
  ExitIcon,
  HamburgerMenuIcon,
  MoonIcon,
  Pencil2Icon,
  PlusIcon,
  SunIcon,
  TrashIcon,
} from '@radix-ui/react-icons';
import {
  Button,
  Callout,
  Code,
  Dialog,
  DropdownMenu,
  Flex,
  IconButton,
  Select,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@radix-ui/themes';
import type { SkillInfo } from '@opencode/client';
import AgentPicker from '@core/components/AgentPicker';
import AttachmentButton from '@core/components/AttachmentButton';
import CustomModelModal from '@core/components/CustomModelModal';
import Companion, { type CompanionState } from '@core/components/companion';
import Messages from '@core/components/Messages';
import OptionPicker, { type PickerOption } from '@core/components/OptionPicker';
import PermissionModal from '@core/components/PermissionModal';
import QuestionPrompt from '@core/components/QuestionPrompt';
import SessionList from '@core/components/SessionList';
import SkillPicker from '@core/components/SkillPicker';
import { useAttachments } from '@core/hooks/useAttachments';
import { useChatSession, type ChatStatus, type ModelRef } from '@core/hooks/useChatSession';
import { appBridge } from '@core/lib/bridge';
import { makeClient, type Conn } from '@core/lib/client';
import { errorText } from '@core/lib/error';
import { deleteProviderModel } from '@core/lib/opencodeConfig';
import { useAppStore, type CompanionKind, type CustomModel } from '@core/lib/store';

type ModelOption = {
  value: string;
  label: string;
  providerID: string;
  modelID: string;
};

const THEME_ITEMS = [
  { key: 'auto', label: '跟随系统', icon: <DesktopIcon /> },
  { key: 'light', label: '浅色', icon: <SunIcon /> },
  { key: 'dark', label: '深色', icon: <MoonIcon /> },
];

const STATUS_META: Record<ChatStatus, { color: string; label: string }> = {
  connecting: { color: 'var(--muted)', label: '连接中' },
  online: { color: 'var(--ok)', label: '已连接' },
  offline: { color: 'var(--err)', label: '已断开' },
};

/**
 * 单个 OpenCode 会话的聊天外壳：会话与事件流由 useChatSession 负责，
 * 这里只处理模型选择、输入区和弹窗。
 */
export default function Chat({ conn, onDisconnect }: { conn: Conn; onDisconnect: () => void }) {
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const companion = useAppStore((state) => state.companion);
  const setCompanion = useAppStore((state) => state.setCompanion);
  const client = useMemo(() => makeClient(conn), [conn]);
  const {
    sessionID,
    sessions,
    agentID,
    blocks,
    status,
    busy,
    activity,
    queue,
    forms,
    formPending,
    error,
    clearError,
    send,
    selectSession,
    newSession,
    renameSession,
    deleteSession,
    stop,
    reply,
    replyForm,
    cancelForm,
    regenerate,
    switchModel,
    switchAgent,
  } = useChatSession(conn, client);

  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const model = useAppStore((state) => state.model);
  const setModel = useAppStore((state) => state.setModel);
  // 已发送内容的最近 10 条，最新在前；上箭头依次回填。
  const historyRef = useRef<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelsReady, setModelsReady] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<CustomModel | null>(null);
  const customModels = useAppStore((state) => state.customModels);
  const removeCustomModel = useAppStore((state) => state.removeCustomModel);
  const [modelError, setModelError] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const senderRef = useRef<ComponentRef<typeof Sender>>(null);
  const attachments = useAttachments({
    directory: conn.directory,
    disabled: !sessionID || busy,
  });

  async function submit(text: string) {
    if (text.trim()) {
      historyRef.current = [text, ...historyRef.current.filter((item) => item !== text)].slice(
        0,
        10
      );
    }
    setHistoryIndex(-1);
    const skillTags = selectedSkill ? [{ id: selectedSkill.id, name: selectedSkill.name }] : [];
    let note = '';
    try {
      note = await attachments.commit();
    } catch (cause) {
      console.error('保存附件失败：', cause);
      return;
    }
    setDraft('');
    setSelectedSkill(null);
    attachments.clear();
    await send(text + note, skillTags);
  }

  // 光标在开头（或正在翻历史）时，上下箭头浏览已发送内容，避免干扰正常的光标移动。
  function handleHistoryKey(event: React.KeyboardEvent) {
    const items = historyRef.current;
    if (!items.length) return;
    const atStart = (event.currentTarget as HTMLTextAreaElement).selectionStart === 0;
    if (event.key === 'ArrowUp' && (historyIndex >= 0 || atStart)) {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, items.length - 1);
      setHistoryIndex(next);
      setDraft(items[next]);
    } else if (event.key === 'ArrowDown' && historyIndex >= 0) {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setDraft(next < 0 ? '' : items[next]);
    }
  }

  // 每个会话打开时都对齐一次全局模型偏好，避免下拉显示与实际使用的模型不一致。
  const modelSyncedFor = useRef<string | null>(null);

  // 当前目录可用的模型，以及服务端默认模型；selected 是调用时的当前选择。
  async function reloadModels(selected: ModelRef | null) {
    const location = conn.directory ? { directory: conn.directory } : undefined;
    const [list, current] = await Promise.all([
      client.model.list({ location, types: ['chat'] }),
      client.model.default({ location }),
    ]);
    const options = list.data.map((item) => ({
      value: `${item.providerID}/${item.id}`,
      label: item.name ?? item.id,
      providerID: item.providerID,
      modelID: item.id,
    }));
    setModelOptions(options);

    // 保存的模型如果已不在目录里，清掉偏好并退回服务端默认模型。
    const valid = (ref: ModelRef) =>
      options.some((option) => option.value === `${ref.providerID}/${ref.id}`);
    if (selected && !valid(selected)) {
      selected = null;
      setModel(null);
    }
    if (!selected && current.data) {
      const ref = { providerID: current.data.providerID, id: current.data.id };
      setModel(ref);
    }

    setModelsReady(true);
  }

  useEffect(() => {
    reloadModels(useAppStore.getState().model).catch(() => {
      // 模型列表属于可选 UI；拉取失败时仍使用服务端默认模型。
    });
  }, [client, conn.directory]);

  // 会话创建 / 切换后补一次模型切换，避免默认模型比会话晚返回。
  useEffect(() => {
    if (!sessionID || !model || !modelsReady || modelSyncedFor.current === sessionID) return;
    modelSyncedFor.current = sessionID;
    void switchModel(model);
  }, [model, modelsReady, sessionID]);

  const currentCustomModel =
    customModels.find(
      (item) => item.providerID === model?.providerID && item.modelID === model?.id
    ) ?? null;

  async function deleteCustomModel(custom: CustomModel) {
    if (currentCustomModel === custom) return;
    try {
      await deleteProviderModel(client, conn.directory, custom.providerID, custom.modelID);
      removeCustomModel(custom);
      setModelError(null);
      await reloadModels(model);
    } catch (cause) {
      setModelError(errorText(cause));
    }
  }

  // 模型下拉的卡片式布局：状态点、名称、自定义标记、Provider。
  const modelPickerOptions: PickerOption[] = modelOptions.map((option) => {
    const { providerID, modelID, label } = option;
    const selected = !!model && `${providerID}/${modelID}` === `${model.providerID}/${model.id}`;
    const custom = customModels.find(
      (item) => item.providerID === providerID && item.modelID === modelID
    );
    return {
      value: option.value,
      search: `${label} ${providerID}`,
      content: () => (
        <Flex align="center" gap="2" className="min-w-0 flex-1">
          <span
            className={`size-2 shrink-0 rounded-full ${selected ? 'bg-(--ok)' : 'bg-(--line)'}`}
          />
          <Text size="2" truncate className="min-w-0">
            {label}
          </Text>
          {custom && (
            <Text
              size="1"
              className="shrink-0 rounded-full border border-(--accent)/30 bg-(--accent)/10 px-1.5 py-px text-(--accent)"
            >
              自定义
            </Text>
          )}
          {!selected && (
            <Text size="1" color="gray" className="ml-auto shrink-0 font-mono">
              {providerID}
            </Text>
          )}
        </Flex>
      ),
      actions: custom ? (
        <>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label="编辑"
            title="编辑"
            onClick={() => {
              setEditingModel(custom);
              setCustomOpen(true);
            }}
          >
            <Pencil2Icon />
          </IconButton>
          <IconButton
            size="1"
            variant="ghost"
            color="red"
            aria-label="删除"
            title={selected ? '当前模型不能删除' : '删除'}
            disabled={selected}
            onClick={() => void deleteCustomModel(custom)}
          >
            <TrashIcon />
          </IconButton>
        </>
      ) : undefined,
    };
  });

  function pickModel(value: string) {
    const slash = value.indexOf('/');
    if (slash < 0) return;
    const ref = { providerID: value.slice(0, slash), id: value.slice(slash + 1) };
    setModel(ref);
    void switchModel(ref);
  }

  // 桌面端才提供 skill 选择；Web 端直接跳过。会话创建前 skill 列表可能为空，所以等 sessionID。
  async function refreshSkills() {
    if (!appBridge || !sessionID) return;
    try {
      const result = await client.skill.list({
        location: conn.directory ? { directory: conn.directory } : undefined,
      });
      setSkills(result.data);
    } catch {
      // 服务端没有 skill API 时忽略。
    }
  }

  useEffect(() => {
    void refreshSkills();
  }, [client, conn.directory, sessionID]);

  const meta = STATUS_META[status];

  function companionState(): CompanionState {
    if (status === 'offline' || error) return 'error';
    if (status === 'connecting') return 'takeoff';
    if (queue.length > 0) return 'waiting';
    if (activity === 'talking') return 'talking';
    if (activity === 'reading') return 'reading';
    if (activity === 'working') return 'soaring';
    if (activity === 'thinking') return 'thinking';
    return 'idle';
  }

  // closeOnPick：窄屏抽屉里点完就收起，桌面端侧栏保持常驻。
  const history = (closeOnPick: boolean) => (
    <SessionList
      sessions={sessions}
      current={sessionID}
      busy={busy}
      onSelect={(id) => {
        if (closeOnPick) setHistoryOpen(false);
        void selectSession(id);
      }}
      onNew={() => {
        if (closeOnPick) setHistoryOpen(false);
        void newSession();
      }}
      onRename={renameSession}
      onDelete={deleteSession}
    />
  );

  return (
    <div className="flex h-dvh min-w-0 bg-(--bg)">
      {!historyCollapsed && (
        <aside className="hidden w-[260px] shrink-0 border-r border-(--line) sm:block">
          {history(false)}
        </aside>
      )}

      <div className="grid min-w-0 flex-1 grid-rows-[auto_1fr_auto] bg-(--bg)">
        <header className="flex items-center justify-between gap-4 overflow-hidden border-b border-(--line) bg-(--bar) px-5 py-2.5 text-[13px] backdrop-blur-[10px] max-sm:flex-wrap max-sm:px-3 max-sm:py-2">
          <Flex align="center" gap="2" className="min-w-0 flex-1 overflow-hidden max-sm:basis-full">
            <IconButton
              variant="ghost"
              color="gray"
              className="max-sm:hidden"
              aria-label={historyCollapsed ? '展开会话历史' : '折叠会话历史'}
              title={historyCollapsed ? '展开会话历史' : '折叠会话历史'}
              onClick={() => setHistoryCollapsed((value) => !value)}
            >
              {historyCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </IconButton>
            <span className="size-2 shrink-0 rounded-full" style={{ background: meta.color }} />
            <Text size="2" weight="bold" className="whitespace-nowrap">
              Lane
            </Text>
            <Tooltip content={appBridge && conn.directory ? '打开项目目录' : undefined}>
              <Text
                size="1"
                color="gray"
                truncate
                className={`max-w-[min(46vw,480px)] max-sm:hidden ${
                  appBridge && conn.directory ? 'cursor-pointer hover:underline' : ''
                }`}
                onClick={
                  appBridge && conn.directory
                    ? () => void appBridge?.openPath(conn.directory)
                    : undefined
                }
              >
                {conn.directory}
              </Text>
            </Tooltip>
          </Flex>
          <Flex
            align="center"
            gap="1"
            className="shrink-0 max-sm:w-full max-sm:flex-wrap max-sm:justify-end"
          >
            <Select.Root
              value={companion}
              onValueChange={(value) => setCompanion(value as CompanionKind)}
            >
              <Select.Trigger className="max-sm:hidden!" radius="large" variant="soft" />
              <Select.Content>
                <Select.Item value="eagle">小鹰</Select.Item>
                <Select.Item value="cat">小猫</Select.Item>
              </Select.Content>
            </Select.Root>
            <AgentPicker
              client={client}
              directory={conn.directory}
              agentID={agentID}
              modelOptions={modelOptions.map((item) => ({ value: item.value, label: item.label }))}
              onSwitch={(id) => void switchAgent(id)}
            />
            <OptionPicker
              value={model ? `${model.providerID}/${model.id}` : null}
              trigger={
                modelOptions.find((item) => item.value === `${model?.providerID}/${model?.id}`)
                  ?.label ?? '选择模型'
              }
              triggerClassName="w-[200px] max-sm:w-[120px]"
              placeholder="搜索模型"
              options={modelPickerOptions}
              width={340}
              onSelect={pickModel}
              addLabel="添加自定义模型"
              addIcon={<PlusIcon />}
              onAdd={() => {
                setEditingModel(null);
                setCustomOpen(true);
              }}
            />
            <Text size="1" color="gray" className="max-sm:hidden">
              {meta.label}
            </Text>
            {sessionID && (
              <Tooltip content="当前会话 ID">
                <Code variant="soft" color="blue" className="font-mono max-sm:hidden">
                  {sessionID.slice(-8)}
                </Code>
              </Tooltip>
            )}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton variant="ghost" color="gray" aria-label="主题" title="主题">
                  {themeMode === 'light' ? (
                    <SunIcon />
                  ) : themeMode === 'dark' ? (
                    <MoonIcon />
                  ) : (
                    <DesktopIcon />
                  )}
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.RadioGroup
                  value={themeMode}
                  onValueChange={(key) => {
                    if (key === 'auto' || key === 'light' || key === 'dark') setThemeMode(key);
                  }}
                >
                  {THEME_ITEMS.map((item) => (
                    <DropdownMenu.RadioItem key={item.key} value={item.key}>
                      {item.icon}
                      {item.label}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <Button variant="ghost" color="gray" aria-label="断开" onClick={onDisconnect}>
              <Flex align="center" gap="1">
                <ExitIcon />
                <span className="max-sm:hidden">断开</span>
              </Flex>
            </Button>
          </Flex>
        </header>

        <main className="mx-auto flex min-h-0 w-full min-w-0 max-w-[900px] flex-col px-4 pt-3 max-sm:px-2.5 max-sm:pt-2">
          {(error || modelError) && (
            <Callout.Root color="red" size="1" className="mb-2.5 pr-8">
              <Callout.Text>{error ?? modelError}</Callout.Text>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                aria-label="关闭"
                className="absolute top-1 right-1"
                onClick={() => {
                  clearError();
                  setModelError(null);
                }}
              >
                <Cross2Icon />
              </IconButton>
            </Callout.Root>
          )}

          <Messages
            blocks={blocks}
            busy={busy}
            directory={conn.directory}
            onSuggestion={(text) => {
              setHistoryIndex(-1);
              setDraft(text);
            }}
            onRegenerate={regenerate}
          />
        </main>

        <footer className="composer mx-auto w-full max-w-[900px] px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-2.5 max-sm:px-2.5 max-sm:pb-[calc(10px+env(safe-area-inset-bottom))] max-sm:pt-2">
          {forms[0] ? (
            <QuestionPrompt
              form={forms[0]}
              count={forms.length}
              pending={formPending}
              onReply={(answer) => void replyForm(answer)}
              onCancel={() => void cancelForm()}
            />
          ) : (
            <div className={busy ? 'sender-glow' : 'sender-normal'}>
              <Sender
                ref={senderRef}
                className={busy ? 'thinking' : undefined}
                value={draft}
                onChange={setDraft}
                onKeyDown={handleHistoryKey}
                onSubmit={(text) => void submit(text)}
                loading={busy}
                onCancel={() => void stop()}
                disabled={!sessionID}
                placeholder={
                  sessionID ? '描述你要 Lane 做的事，Enter 发送，Shift+Enter 换行' : '正在创建会话…'
                }
                autoSize={{ minRows: 2, maxRows: 2 }}
                skill={
                  selectedSkill
                    ? {
                        title: selectedSkill.name,
                        value: selectedSkill.id,
                        closable: { onClose: () => setSelectedSkill(null) },
                      }
                    : undefined
                }
                header={appBridge ? attachments.header : undefined}
                footer={
                  <Flex align="center" justify="between" gap="2">
                    <Flex align="center" gap="1">
                      {/*{appBridge && (*/}
                      {/*  <AttachmentButton onClick={attachments.open} disabled={!sessionID || busy} />*/}
                      {/*)}*/}
                      {appBridge && (
                        <SkillPicker
                          skills={skills}
                          selected={selectedSkill}
                          onSelect={(skill) => {
                            setSelectedSkill(skill);
                            // 选中后 Sender 会从 textarea 换成 contenteditable，等重渲染完再聚焦。
                            requestAnimationFrame(() => senderRef.current?.focus());
                          }}
                          onRefresh={() => void refreshSkills()}
                        />
                      )}
                    </Flex>
                    <Flex align="center" gap="2">
                      <Text size="1" color="gray">
                        Enter 发送 · Shift+Enter 换行
                      </Text>
                    </Flex>
                  </Flex>
                }
              />
            </div>
          )}
        </footer>

        <Companion kind={companion} state={companionState()} />

        <PermissionModal
          request={queue[0]}
          count={queue.length}
          onReply={(decision) => void reply(decision)}
        />

        <CustomModelModal
          open={customOpen}
          client={client}
          directory={conn.directory}
          current={model}
          editing={editingModel}
          onClose={() => {
            setCustomOpen(false);
            setEditingModel(null);
          }}
          onSaved={async (saved) => {
            await reloadModels(model);
            const ref = { providerID: saved.providerID, id: saved.modelID };
            setModel(ref);
            await switchModel(ref);
          }}
        />
      </div>
    </div>
  );
}
