import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Alert,
  App as AntdApp,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Flex,
  Select,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { Sender } from '@ant-design/x';
import {
  DeleteOutlined,
  DesktopOutlined,
  EditOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  MoonOutlined,
  PlusOutlined,
  SunOutlined,
} from '@ant-design/icons';
import type { SkillInfo } from '@opencode/client';
import AgentPicker from '@core/components/AgentPicker';
import AttachmentButton from '@core/components/AttachmentButton';
import CustomModelModal from '@core/components/CustomModelModal';
import Companion, { type CompanionState } from '@core/components/companion';
import Messages from '@core/components/Messages';
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
import { socket } from '@core/lib/socket';
import { useAppStore, type CompanionKind, type CustomModel } from '@core/lib/store';

type ModelOption = {
  value: string;
  label: string;
  providerID: string;
  modelID: string;
};

const CUSTOM_ADD_VALUE = '__custom_add__';

const THEME_ITEMS = [
  { key: 'auto', label: '跟随系统', icon: <DesktopOutlined /> },
  { key: 'light', label: '浅色', icon: <SunOutlined /> },
  { key: 'dark', label: '深色', icon: <MoonOutlined /> },
];

const STATUS_META: Record<
  ChatStatus,
  { badge: 'processing' | 'success' | 'error'; label: string }
> = {
  connecting: { badge: 'processing', label: '连接中' },
  online: { badge: 'success', label: '已连接' },
  offline: { badge: 'error', label: '已断开' },
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
    hasMore,
    loadingMore,
    loadMore,
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
  // 服务端通过 socket 推送的消息：先回填输入框，再自动触发发送。
  useEffect(() => {
    const onMessage = (payload: unknown) => {
      const message =
        typeof payload === 'string' ? payload : (payload as { msg?: unknown } | null)?.msg;
      if (typeof message !== 'string' || !message.trim()) return;
      setDraft(message);
      // 等输入框回填后，在下一帧走和发送按钮相同的提交逻辑。
      requestAnimationFrame(() => void submit(message));
    };
    socket.on('chat message', onMessage);
    return () => {
      socket.off('chat message', onMessage);
    };
  }, [submit]);
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
  const { message } = AntdApp.useApp();
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

  const modelSelectOptions = [
    ...modelOptions,
    {
      value: CUSTOM_ADD_VALUE,
      label: '添加自定义模型',
      providerID: '',
      modelID: '',
      className: 'model-add-option',
    },
  ];

  const currentCustomModel =
    customModels.find(
      (item) => item.providerID === model?.providerID && item.modelID === model?.id
    ) ?? null;

  async function deleteCustomModel(custom: CustomModel) {
    if (currentCustomModel === custom) return;
    try {
      await deleteProviderModel(client, conn.directory, custom.providerID, custom.modelID);
      removeCustomModel(custom);
      message.success('自定义模型已删除');
      await reloadModels(model);
    } catch (cause) {
      message.error(errorText(cause));
    }
  }

  /** 模型下拉的卡片式布局：状态点、名称、自定义标记、Provider。 */
  function renderModelOption(option: {
    value?: unknown;
    label?: ReactNode;
    data?: ModelOption;
  }): ReactNode {
    if (String(option.value) === CUSTOM_ADD_VALUE) {
      return (
        <span className="flex w-full items-center justify-center gap-1.5 text-[13px] text-(--muted)">
          <PlusOutlined className="text-[11px]" />
          添加自定义模型
        </span>
      );
    }

    // 自定义字段挂在 option.data 上，FlattenOptionData 不会把它们展开到顶层。
    const { providerID = '', modelID = '' } = option.data ?? {};
    const label = option.data?.label ?? option.label;
    const selected = !!model && `${providerID}/${modelID}` === `${model.providerID}/${model.id}`;
    const custom = customModels.find(
      (item) => item.providerID === providerID && item.modelID === modelID
    );

    return (
      <div className="group flex w-full min-w-0 items-center gap-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${selected ? 'bg-(--ok)' : 'bg-(--line)'}`}
        />
        <span className="min-w-0 truncate text-[13px] text-(--text)">{label}</span>
        {custom && (
          <span className="shrink-0 rounded-full border border-(--accent)/30 bg-(--accent)/10 px-1.5 py-px text-[11px] leading-4 text-(--accent)">
            自定义
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {/* 自定义模型悬停时用编辑/删除按钮替换 provider ID。 */}
          <span
            className={`font-mono text-[11px] text-(--muted) ${selected ? 'hidden' : ''} ${
              custom ? 'group-hover:hidden' : ''
            }`}
          >
            {providerID}
          </span>
          {custom && (
            <span
              className="hidden items-center group-hover:flex"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                size="small"
                type="text"
                title="编辑"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingModel(custom);
                  setCustomOpen(true);
                }}
              />
              <Button
                size="small"
                type="text"
                danger
                title={selected ? '当前模型不能删除' : '删除'}
                disabled={selected}
                icon={<DeleteOutlined />}
                onClick={() => void deleteCustomModel(custom)}
              />
            </span>
          )}
        </span>
      </div>
    );
  }

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
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={() => void loadMore()}
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
      <Drawer
        placement="left"
        size={264}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        {history(true)}
      </Drawer>

      <div className="grid min-w-0 flex-1 grid-rows-[auto_1fr_auto] bg-(--bg)">
        <header className="flex items-center justify-between gap-4 overflow-hidden border-b border-(--line) bg-(--bar) px-5 py-2.5 text-[13px] backdrop-blur-[10px] max-sm:px-3 max-sm:py-2">
          <Flex align="center" gap={10} className="min-w-0 flex-1 overflow-hidden">
            <Button
              type="text"
              className="sm:hidden!"
              icon={<MenuOutlined />}
              onClick={() => setHistoryOpen(true)}
            />
            <Button
              type="text"
              className="max-sm:hidden!"
              title={historyCollapsed ? '展开会话历史' : '折叠会话历史'}
              icon={historyCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setHistoryCollapsed((value) => !value)}
            />
            <Badge status={meta.badge} />
            <Typography.Text strong className="whitespace-nowrap">
              Lane
            </Typography.Text>
            <Tooltip title={appBridge && conn.directory ? '打开项目目录' : undefined}>
              <Typography.Text
                type="secondary"
                ellipsis
                className={`max-w-[min(46vw,480px)] text-xs! max-sm:hidden ${
                  appBridge && conn.directory ? 'cursor-pointer hover:underline' : ''
                }`}
                onClick={
                  appBridge && conn.directory
                    ? () => void appBridge?.openPath(conn.directory)
                    : undefined
                }
              >
                {conn.directory}
              </Typography.Text>
            </Tooltip>
          </Flex>
          <Flex align="center" gap={8} className="shrink-0">
            <Select<CompanionKind>
              value={companion}
              onChange={setCompanion}
              options={[
                { value: 'eagle', label: '小鹰' },
                { value: 'cat', label: '小猫' },
              ]}
              popupMatchSelectWidth={false}
            />
            <AgentPicker
              client={client}
              directory={conn.directory}
              agentID={agentID}
              modelOptions={modelOptions.map((item) => ({ value: item.value, label: item.label }))}
              onSwitch={(id) => void switchAgent(id)}
            />
            <Select
              className="w-[200px]! max-sm:w-[130px]!"
              style={{ maxHeight: 'none' }}
              placeholder="选择模型"
              value={model ? `${model.providerID}/${model.id}` : undefined}
              options={modelSelectOptions}
              optionRender={renderModelOption}
              classNames={{ popup: { root: 'model-picker' } }}
              onChange={(value) => {
                if (value === CUSTOM_ADD_VALUE) {
                  setEditingModel(null);
                  setCustomOpen(true);
                  return;
                }
                pickModel(value);
              }}
              popupMatchSelectWidth={false}
              showSearch={{
                filterOption: (input, option) =>
                  `${option?.label ?? ''} ${option?.providerID ?? ''}`
                    .toLowerCase()
                    .includes(input.toLowerCase()),
              }}
            />
            <Typography.Text type="secondary" className="text-xs!">
              {meta.label}
            </Typography.Text>
            {sessionID && (
              <Tooltip title="当前会话 ID">
                <Tag variant="filled" color="blue" className="font-mono">
                  {sessionID.slice(-8)}
                </Tag>
              </Tooltip>
            )}
            <Dropdown
              trigger={['click']}
              menu={{
                selectable: true,
                selectedKeys: [themeMode],
                items: THEME_ITEMS,
                onClick: ({ key }) => {
                  if (key === 'auto' || key === 'light' || key === 'dark') setThemeMode(key);
                },
              }}
            >
              <Button
                type="text"
                title="主题"
                icon={
                  themeMode === 'light' ? (
                    <SunOutlined />
                  ) : themeMode === 'dark' ? (
                    <MoonOutlined />
                  ) : (
                    <DesktopOutlined />
                  )
                }
              />
            </Dropdown>
            <Button type="text" icon={<LogoutOutlined />} onClick={onDisconnect}>
              断开
            </Button>
          </Flex>
        </header>

        <main className="mx-auto flex min-h-0 w-full min-w-0 max-w-[900px] flex-col px-4 pt-3 max-sm:px-2.5 max-sm:pt-2">
          {error && (
            <Alert
              className="mb-2.5"
              type="error"
              showIcon
              closable={{ onClose: clearError }}
              title={error}
            />
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
                  <Flex align="center" justify="space-between" gap={8}>
                    <Flex align="center" gap={4}>
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
                    <Flex align="center" gap={8}>
                      <Typography.Text type="secondary" className="text-xs!">
                        Enter 发送 · Shift+Enter 换行
                      </Typography.Text>
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
