import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Flex,
  Modal,
  Space,
  Tag,
  Tooltip,
  Typography,
  App as AntdApp,
} from "antd"
import {
  Actions,
  Bubble,
  Prompts,
  Sender,
  ThoughtChain,
  Welcome,
  type BubbleItemType,
  type PromptsItemType,
  type ThoughtChainItemType,
} from "@ant-design/x"
import {
  BulbOutlined,
  CopyOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  LogoutOutlined,
  RobotOutlined,
  ThunderboltFilled,
  UserOutlined,
} from "@ant-design/icons"
import type { PermissionRequest } from "@opencode/client"
import Markdown from "./components/Markdown"
import { makeClient, type Conn } from "./lib/client"
import { blocksFromMessages, patch, upsert, type Block, type ToolStatus } from "./lib/blocks"

type ChatStatus = "connecting" | "online" | "offline"

type ActivityBlock = Extract<Block, { kind: "reasoning" | "tool" }>

type ViewItem =
  | { key: string; role: "user"; text: string }
  | { key: string; role: "ai"; text: string }
  | { key: string; role: "activity"; blocks: ActivityBlock[] }
  | { key: string; role: "system"; text: string }

const SUGGESTIONS: PromptsItemType[] = [
  {
    key: "explain",
    icon: <FileSearchOutlined />,
    label: "了解项目",
    description: "介绍一下这个项目的结构、入口和关键模块",
  },
  {
    key: "improve",
    icon: <BulbOutlined />,
    label: "找点活干",
    description: "看看这个项目还有哪些可以改进的地方",
  },
  {
    key: "test",
    icon: <ExperimentOutlined />,
    label: "跑测试",
    description: "运行测试，并修复失败的用例",
  },
]

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ""
  return content
    .map((item) => (item && typeof item === "object" && "text" in item ? String((item as any).text) : ""))
    .filter(Boolean)
    .join("\n")
}

/**
 * Collapse consecutive reasoning / tool blocks into a single activity group so
 * each run renders as one ThoughtChain instead of a stack of one-item cards.
 */
function toViewItems(blocks: Block[]): ViewItem[] {
  const items: ViewItem[] = []
  for (const block of blocks) {
    if (block.kind === "reasoning" || block.kind === "tool") {
      const last = items[items.length - 1]
      if (last?.role === "activity") {
        last.blocks.push(block)
      } else {
        items.push({ key: `activity:${block.id}`, role: "activity", blocks: [block] })
      }
      continue
    }
    if (block.kind === "notice") {
      items.push({ key: block.id, role: "system", text: block.text })
      continue
    }
    items.push({ key: block.id, role: block.kind === "user" ? "user" : "ai", text: block.text })
  }
  return items
}

const STATUS_META: Record<ChatStatus, { badge: "processing" | "success" | "error"; label: string }> = {
  connecting: { badge: "processing", label: "连接中" },
  online: { badge: "success", label: "已连接" },
  offline: { badge: "error", label: "已断开" },
}

export default function Chat({ conn, onDisconnect }: { conn: Conn; onDisconnect: () => void }) {
  const { message } = AntdApp.useApp()
  const client = useMemo(() => makeClient(conn), [conn])
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [status, setStatus] = useState<ChatStatus>("connecting")
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<PermissionRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")

  const sessionRef = useRef<string | null>(null)

  useEffect(() => {
    sessionRef.current = sessionID
  }, [sessionID])

  const reload = useCallback(
    async (id: string) => {
      const response = await client.message.list({ sessionID: id, order: "asc", limit: 200 })
      setBlocks(blocksFromMessages(response.data))
    },
    [client],
  )

  // Create a session in the chosen directory.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await client.session.create({
          title: "Web session",
          location: conn.directory ? { directory: conn.directory } : undefined,
        })
        if (cancelled) return
        setSessionID(session.id)
        setStatus("online")
        await reload(session.id)
      } catch (cause) {
        if (cancelled) return
        setStatus("offline")
        setError(errorText(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, conn.directory, reload])

  // Pending permission requests that were raised before this client connected.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await client.permission.request.list({
          location: conn.directory ? { directory: conn.directory } : undefined,
        })
        if (!cancelled && response.data.length) setQueue(response.data)
      } catch {
        // Experimental endpoint; ignore if the server does not expose it.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, conn.directory])

  // The single event stream that drives the whole UI.
  useEffect(() => {
    const controller = new AbortController()

    ;(async () => {
      try {
        for await (const event of client.event.subscribe({ signal: controller.signal })) {
          switch (event.type) {
            case "server.connected":
              setStatus("online")
              break

            case "session.execution.started":
              if (event.data.sessionID === sessionRef.current) setBusy(true)
              break

            case "session.text.started": {
              if (event.data.sessionID !== sessionRef.current) break
              const id = `text:${event.data.assistantMessageID}:${event.data.ordinal}`
              setBlocks((current) => upsert(current, { id, kind: "text", text: "" }))
              break
            }

            case "session.text.delta": {
              if (event.data.sessionID !== sessionRef.current) break
              const id = `text:${event.data.assistantMessageID}:${event.data.ordinal}`
              setBlocks((current) =>
                upsert(current, {
                  id,
                  kind: "text",
                  text: (current.find((b) => b.id === id) as { text?: string } | undefined)?.text ?? "",
                }),
              )
              setBlocks((current) =>
                patch(current, id, (block) =>
                  block.kind === "text" ? { ...block, text: block.text + event.data.delta } : block,
                ),
              )
              break
            }

            case "session.text.ended": {
              if (event.data.sessionID !== sessionRef.current) break
              const id = `text:${event.data.assistantMessageID}:${event.data.ordinal}`
              setBlocks((current) => upsert(current, { id, kind: "text", text: event.data.text }))
              break
            }

            case "session.reasoning.started": {
              if (event.data.sessionID !== sessionRef.current) break
              const id = `reasoning:${event.data.assistantMessageID}:${event.data.ordinal}`
              setBlocks((current) => upsert(current, { id, kind: "reasoning", text: "" }))
              break
            }

            case "session.reasoning.delta": {
              if (event.data.sessionID !== sessionRef.current) break
              const id = `reasoning:${event.data.assistantMessageID}:${event.data.ordinal}`
              setBlocks((current) =>
                upsert(current, {
                  id,
                  kind: "reasoning",
                  text: (current.find((b) => b.id === id) as { text?: string } | undefined)?.text ?? "",
                }),
              )
              setBlocks((current) =>
                patch(current, id, (block) =>
                  block.kind === "reasoning" ? { ...block, text: block.text + event.data.delta } : block,
                ),
              )
              break
            }

            case "session.tool.input.started": {
              if (event.data.sessionID !== sessionRef.current) break
              setBlocks((current) =>
                upsert(current, {
                  id: `tool:${event.data.id}`,
                  kind: "tool",
                  name: event.data.name,
                  status: "running",
                  detail: "",
                }),
              )
              break
            }

            case "session.tool.called": {
              if (event.data.sessionID !== sessionRef.current) break
              setBlocks((current) =>
                patch(current, `tool:${event.data.id}`, (block) =>
                  block.kind === "tool"
                    ? { ...block, detail: JSON.stringify(event.data.input, null, 2) }
                    : block,
                ),
              )
              break
            }

            case "session.tool.success": {
              if (event.data.sessionID !== sessionRef.current) break
              setBlocks((current) =>
                patch(current, `tool:${event.data.id}`, (block) =>
                  block.kind === "tool"
                    ? { ...block, status: "ok" as ToolStatus, detail: textOf(event.data.content) || block.detail }
                    : block,
                ),
              )
              break
            }

            case "session.tool.failed": {
              if (event.data.sessionID !== sessionRef.current) break
              setBlocks((current) =>
                patch(current, `tool:${event.data.id}`, (block) =>
                  block.kind === "tool"
                    ? {
                        ...block,
                        status: "error" as ToolStatus,
                        detail: textOf(event.data.content) || errorText(event.data.error),
                      }
                    : block,
                ),
              )
              break
            }

            case "permission.asked":
              setQueue((current) =>
                current.some((item) => item.id === event.data.id)
                  ? current
                  : [...current, { ...event.data } as PermissionRequest],
              )
              break

            case "permission.replied":
              setQueue((current) => current.filter((item) => item.id !== event.data.requestID))
              break

            // `session.idle` fires when the session goes quiet, which is not
            // reliably the end of a run. The execution.* events are the real
            // "run finished" signal, so settle on those.
            case "session.execution.succeeded":
            case "session.execution.interrupted":
            case "session.idle": {
              if (event.data.sessionID !== sessionRef.current) break
              setBusy(false)
              await reload(event.data.sessionID)
              break
            }

            case "session.execution.failed": {
              if (event.data.sessionID !== sessionRef.current) break
              setBusy(false)
              setError(JSON.stringify(event.data.error))
              await reload(event.data.sessionID)
              break
            }
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setStatus("offline")
          setError(errorText(cause))
        }
      }
    })()

    return () => controller.abort()
  }, [client, reload])

  async function send(text: string) {
    const value = text.trim()
    if (!value || !sessionID || busy) return
    setDraft("")
    setBusy(true)
    setError(null)
    setBlocks((current) => [...current, { id: `local:${Date.now()}`, kind: "user", text: value }])
    try {
      await client.session.prompt({ sessionID, text: value })
    } catch (cause) {
      setBusy(false)
      setError(errorText(cause))
    }
  }

  async function stop() {
    if (!sessionID) return
    try {
      await client.session.interrupt({ sessionID })
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  async function reply(decision: "once" | "always" | "reject") {
    const request = queue[0]
    if (!request) return
    setQueue((current) => current.slice(1))
    try {
      await client.permission.reply({ sessionID: request.sessionID, requestID: request.id, decision })
    } catch (cause) {
      setError(errorText(cause))
    }
  }

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        message.success("已复制")
      } catch {
        message.error("复制失败")
      }
    },
    [message],
  )

  const bubbleItems = useMemo<BubbleItemType[]>(() => {
    const lastTextID = [...blocks].reverse().find((block) => block.kind === "text")?.id

    const items: BubbleItemType[] = toViewItems(blocks).map((item) => {
      if (item.role === "activity") {
        return {
          key: item.key,
          role: "activity",
          content: <Activity blocks={item.blocks} />,
        }
      }
      if (item.role === "system") {
        return { key: item.key, role: "system", content: item.text }
      }
      if (item.role === "user") {
        return { key: item.key, role: "user", content: item.text }
      }
      return {
        key: item.key,
        role: "ai",
        content: <Markdown text={item.text} streaming={busy && item.key === lastTextID} />,
        footer: (
          <Actions
            items={[
              {
                key: "copy",
                label: "复制",
                icon: <CopyOutlined />,
                onItemClick: () => void copy(item.text),
              },
            ]}
          />
        ),
      }
    })

    if (busy) {
      items.push({ key: "working", role: "ai", content: "", loading: true })
    }

    return items
  }, [blocks, busy, copy])

  const roles = useMemo(
    () => ({
      user: {
        placement: "end" as const,
        variant: "filled" as const,
        avatar: <Avatar size="small" icon={<UserOutlined />} />,
        styles: { content: { background: "#1e3252" } },
      },
      ai: {
        placement: "start" as const,
        variant: "outlined" as const,
        avatar: (
          <Avatar
            size="small"
            icon={<RobotOutlined />}
            style={{ background: "linear-gradient(135deg, #4f8cff, #7c5cff)" }}
          />
        ),
      },
      activity: {
        placement: "start" as const,
        variant: "borderless" as const,
        avatar: (
          <Avatar
            size="small"
            icon={<ThunderboltFilled />}
            style={{ background: "#2a303b", color: "#8fb4ff" }}
          />
        ),
      },
      system: { placement: "start" as const },
    }),
    [],
  )

  const request = queue[0]
  const meta = STATUS_META[status]

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
            onClose={() => setError(null)}
          />
        )}

        {blocks.length === 0 && !busy ? (
          <div className="empty">
            <Welcome
              variant="borderless"
              icon={
                <Avatar
                  size={48}
                  icon={<ThunderboltFilled />}
                  style={{
                    background: "linear-gradient(135deg, #4f8cff, #7c5cff)",
                    color: "#fff",
                  }}
                />
              }
              title="交给 agent 吧"
              description={`已连接 ${conn.directory}，在下面描述你想做的事。`}
            />
            <Prompts
              title="或者试试这些"
              items={SUGGESTIONS}
              vertical
              onItemClick={({ data }) => setDraft(String(data.description ?? data.label ?? ""))}
            />
          </div>
        ) : (
          <Bubble.List
            className="bubbles"
            items={bubbleItems}
            role={roles}
            autoScroll
            style={{ height: "100%" }}
          />
        )}
      </main>

      <footer className="composer">
        <Sender
          value={draft}
          onChange={setDraft}
          onSubmit={(text) => void send(text)}
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
      </footer>

      <Modal
        open={!!request}
        title={
          <Space>
            需要授权
            {queue.length > 1 && <Tag color="blue">{queue.length} 个待处理</Tag>}
          </Space>
        }
        closable={false}
        mask={{ closable: false }}
        keyboard={false}
        footer={[
          <Button key="reject" danger onClick={() => void reply("reject")}>
            拒绝
          </Button>,
          <Button key="once" onClick={() => void reply("once")}>
            仅本次
          </Button>,
          <Button key="always" type="primary" onClick={() => void reply("always")}>
            总是允许
          </Button>,
        ]}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {request?.message ?? `工具请求执行 ${request?.action ?? ""}`}
          </Typography.Paragraph>
          {request && <Typography.Text code>{request.action}</Typography.Text>}
          {!!request?.resources.length && (
            <div className="resources">
              {request.resources.map((resource) => (
                <Typography.Text key={resource} className="resource mono" ellipsis={{ tooltip: resource }}>
                  {resource}
                </Typography.Text>
              ))}
            </div>
          )}
        </Space>
      </Modal>
    </div>
  )
}

function Activity({ blocks }: { blocks: ActivityBlock[] }) {
  const autoKeys = useMemo(
    () =>
      blocks
        .filter((block) => {
          if (block.kind === "tool") return block.status !== "ok"
          return block.id === blocks[blocks.length - 1]?.id
        })
        .map((block) => block.id),
    [blocks],
  )

  const [expanded, setExpanded] = useState<string[]>(autoKeys)
  const previousAutoKeys = useRef<string[]>(autoKeys)
  const autoKeyString = autoKeys.join("|")

  // Keep in-flight items open, and fold them again once they settle. Keys the
  // user opened by hand are never in `previousAutoKeys`, so they stay open.
  useEffect(() => {
    const previous = previousAutoKeys.current
    previousAutoKeys.current = autoKeys
    setExpanded((current) => {
      const next = new Set(current)
      for (const key of previous) {
        if (!autoKeys.includes(key)) next.delete(key)
      }
      for (const key of autoKeys) next.add(key)
      return Array.from(next)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKeyString])

  const items: ThoughtChainItemType[] = blocks.map((block) => {
    if (block.kind === "reasoning") {
      return {
        key: block.id,
        icon: <BulbOutlined />,
        title: "思考过程",
        collapsible: true,
        content: block.text ? <pre className="chain-pre">{block.text}</pre> : null,
      }
    }

    return {
      key: block.id,
      title: <span className="chain-tool-name">{block.name}</span>,
      status:
        block.status === "running" ? "loading" : block.status === "ok" ? "success" : "error",
      collapsible: true,
      content: block.detail ? <pre className="chain-pre">{block.detail}</pre> : null,
    }
  })

  return (
    <ThoughtChain
      className="activity"
      items={items}
      expandedKeys={expanded}
      onExpand={setExpanded}
      line="dashed"
    />
  )
}
