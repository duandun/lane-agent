import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Badge, Button, Dropdown, Flex, Select, Tag, Tooltip, Typography } from "antd"
import { Sender } from "@ant-design/x"
import { LogoutOutlined, MoonOutlined, SunOutlined, DesktopOutlined } from "@ant-design/icons"
import CustomModelModal from "./components/CustomModelModal"
import EagleCompanion, { type EagleState } from "./components/EagleCompanion"
import Messages from "./components/Messages"
import PermissionModal from "./components/PermissionModal"
import { useChatSession, type ChatStatus, type ModelRef } from "./hooks/useChatSession"
import type { ThemeMode } from "./hooks/useThemeMode"
import { makeClient, type Conn } from "./lib/client"
import { loadCustomModels, type CustomModel } from "./lib/customModels"
import { clearModel, loadModel, saveModel } from "./lib/modelPreference"

type ModelOption = { value: string; label: string }

const CUSTOM_MODEL_VALUE = "__custom_model__"

const THEME_ITEMS = [
  { key: "auto", label: "跟随系统", icon: <DesktopOutlined /> },
  { key: "light", label: "浅色", icon: <SunOutlined /> },
  { key: "dark", label: "深色", icon: <MoonOutlined /> },
]

const STATUS_META: Record<ChatStatus, { badge: "processing" | "success" | "error"; label: string }> = {
  connecting: { badge: "processing", label: "连接中" },
  online: { badge: "success", label: "已连接" },
  offline: { badge: "error", label: "已断开" },
}

/**
 * 单个 OpenCode 会话的聊天外壳：会话与事件流由 useChatSession 负责，
 * 这里只处理模型选择、输入区和弹窗。
 */
export default function Chat({
  conn,
  themeMode,
  onThemeChange,
  onDisconnect,
}: {
  conn: Conn
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
  onDisconnect: () => void
}) {
  const client = useMemo(() => makeClient(conn), [conn])
  const {
    sessionID,
    blocks,
    status,
    busy,
    activity,
    queue,
    error,
    clearError,
    send,
    stop,
    reply,
    regenerate,
    switchModel,
  } = useChatSession(conn, client)

  const [draft, setDraft] = useState("")
  const [model, setModel] = useState<ModelRef | null>(loadModel)
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [modelsReady, setModelsReady] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customModels, setCustomModels] = useState<CustomModel[]>(loadCustomModels)

  const modelRef = useRef<ModelRef | null>(model)
  const appliedInitialModel = useRef(false)

  // 当前目录可用的模型，以及服务端默认模型。
  const reloadModels = useCallback(async () => {
    const location = conn.directory ? { directory: conn.directory } : undefined
    const [list, current] = await Promise.all([
      client.model.list({ location, types: ["chat"] }),
      client.model.default({ location }),
    ])
    const options = list.data.map((item) => ({
      value: `${item.providerID}/${item.id}`,
      label: `${item.name ?? item.id} · ${item.providerID}`,
    }))
    setModelOptions(options)

    // 保存的模型如果已不在目录里，清掉偏好并退回服务端默认模型。
    const valid = (ref: ModelRef) =>
      options.some((option) => option.value === `${ref.providerID}/${ref.id}`)
    if (modelRef.current && !valid(modelRef.current)) {
      clearModel()
      modelRef.current = null
      setModel(null)
    }
    if (!modelRef.current && current.data) {
      const ref = { providerID: current.data.providerID, id: current.data.id }
      modelRef.current = ref
      setModel(ref)
    }

    setModelsReady(true)
  }, [client, conn.directory])

  useEffect(() => {
    reloadModels().catch(() => {
      // 模型列表属于可选 UI；拉取失败时仍使用服务端默认模型。
    })
  }, [reloadModels])

  // 会话创建后补一次模型切换，避免默认模型比会话晚返回。
  useEffect(() => {
    if (!sessionID || !model || !modelsReady || appliedInitialModel.current) return
    appliedInitialModel.current = true
    void switchModel(model)
  }, [model, modelsReady, sessionID, switchModel])

  const customModel = customModels.find((item) => item.providerID === model?.providerID) ?? null

  const modelSelectOptions = [
    ...modelOptions,
    { value: CUSTOM_MODEL_VALUE, label: customModel ? "编辑自定义模型…" : "自定义模型…" },
  ]

  function pickModel(value: string) {
    const slash = value.indexOf("/")
    if (slash < 0) return
    const ref = { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
    modelRef.current = ref
    setModel(ref)
    saveModel(ref)
    void switchModel(ref)
  }

  const meta = STATUS_META[status]

  function companionState(): EagleState {
    if (status === "offline" || error) return "error"
    if (status === "connecting") return "takeoff"
    if (queue.length > 0) return "waiting"
    if (activity === "talking") return "talking"
    if (activity === "working") return "soaring"
    if (activity === "thinking") return "thinking"
    return "idle"
  }

  return (
    <div className="app">
      <header className="bar">
        <Flex align="center" gap={10} className="bar-left">
          <Badge status={meta.badge} />
          <Typography.Text strong className="brand">
            OpenCode Web
          </Typography.Text>
          <Typography.Text type="secondary" ellipsis className="directory">
            {conn.directory}
          </Typography.Text>
        </Flex>
        <Flex align="center" gap={8} className="bar-right">
          <Select
            className="model-select"
            placeholder="选择模型"
            value={model ? `${model.providerID}/${model.id}` : undefined}
            options={modelSelectOptions}
            onChange={(value) => {
              if (value === CUSTOM_MODEL_VALUE) {
                setCustomOpen(true)
                return
              }
              pickModel(value)
            }}
            popupMatchSelectWidth={false}
          />
          <Typography.Text type="secondary" className="small">
            {meta.label}
          </Typography.Text>
          {sessionID && (
            <Tooltip title="当前会话 ID">
              <Tag variant="filled" color="blue" className="mono">
                {sessionID.slice(-8)}
              </Tag>
            </Tooltip>
          )}
          <Dropdown
            trigger={["click"]}
            menu={{
              selectable: true,
              selectedKeys: [themeMode],
              items: THEME_ITEMS,
              onClick: ({ key }) => {
                if (key === "auto" || key === "light" || key === "dark") onThemeChange(key)
              },
            }}
          >
            <Button
              type="text"
              title="主题"
              icon={
                themeMode === "light" ? (
                  <SunOutlined />
                ) : themeMode === "dark" ? (
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

      <main className="chat-main">
        {error && (
          <Alert
            className="error-banner"
            type="error"
            showIcon
            closable
            message={error}
            onClose={clearError}
          />
        )}

        <Messages
          blocks={blocks}
          busy={busy}
          directory={conn.directory}
          onSuggestion={setDraft}
          onRegenerate={regenerate}
        />
      </main>

      <footer className="composer">
        <div className={busy ? "sender-glow" : undefined}>
          <Sender
            className={busy ? "thinking" : undefined}
            value={draft}
            onChange={setDraft}
            onSubmit={(text) => {
              setDraft("")
              void send(text)
            }}
            loading={busy}
            onCancel={() => void stop()}
            disabled={!sessionID}
            placeholder={
              sessionID
                ? "描述你要 agent 做的事，Enter 发送，Shift+Enter 换行"
                : "正在创建会话…"
            }
            autoSize={{ minRows: 2, maxRows: 8 }}
            footer={
              <Typography.Text type="secondary" className="sender-hint">
                Enter 发送 · Shift+Enter 换行
              </Typography.Text>
            }
          />
        </div>
      </footer>

      <EagleCompanion state={companionState()} />

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
        editing={customModel}
        onClose={() => setCustomOpen(false)}
        onSaved={async (saved) => {
          setCustomModels(loadCustomModels())
          await reloadModels()
          const ref = { providerID: saved.providerID, id: saved.modelID }
          modelRef.current = ref
          setModel(ref)
          saveModel(ref)
          await switchModel(ref)
        }}
      />
    </div>
  )
}
