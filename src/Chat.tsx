import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Badge, Button, Flex, Select, Tag, Tooltip, Typography } from "antd"
import { Sender } from "@ant-design/x"
import { KeyOutlined, LogoutOutlined } from "@ant-design/icons"
import type { PermissionRequest } from "@opencode/client"
import ApiKeyModal from "./components/ApiKeyModal"
import Messages from "./components/Messages"
import PermissionModal from "./components/PermissionModal"
import { makeClient, type Conn } from "./lib/client"
import { blocksFromMessages, patch, upsert, type Block, type ToolStatus } from "./lib/blocks"
import { errorText } from "./lib/error"

type ChatStatus = "connecting" | "online" | "offline"

type ModelRef = { providerID: string; id: string }

type ModelOption = { value: string; label: string }

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ""
  return content
    .map((item) => (item && typeof item === "object" && "text" in item ? String((item as any).text) : ""))
    .filter(Boolean)
    .join("\n")
}

const STATUS_META: Record<ChatStatus, { badge: "processing" | "success" | "error"; label: string }> = {
  connecting: { badge: "processing", label: "连接中" },
  online: { badge: "success", label: "已连接" },
  offline: { badge: "error", label: "已断开" },
}

export default function Chat({ conn, onDisconnect }: { conn: Conn; onDisconnect: () => void }) {
  const client = useMemo(() => makeClient(conn), [conn])
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [status, setStatus] = useState<ChatStatus>("connecting")
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<PermissionRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [model, setModel] = useState<ModelRef | null>(null)
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [keyOpen, setKeyOpen] = useState(false)

  const sessionRef = useRef<string | null>(null)
  const modelRef = useRef<ModelRef | null>(null)

  useEffect(() => {
    sessionRef.current = sessionID
  }, [sessionID])

  // Models the server offers in this directory, plus the server default.
  const reloadModels = useCallback(async () => {
    const location = conn.directory ? { directory: conn.directory } : undefined
    const [list, current] = await Promise.all([
      client.model.list({ location, types: ["chat"] }),
      client.model.default({ location }),
    ])
    setModelOptions(
      list.data.map((item) => ({
        value: `${item.providerID}/${item.id}`,
        label: `${item.name ?? item.id} · ${item.providerID}`,
      })),
    )
    if (!modelRef.current && current.data) {
      const ref = { providerID: current.data.providerID, id: current.data.id }
      modelRef.current = ref
      setModel(ref)
    }
  }, [client, conn.directory])

  useEffect(() => {
    reloadModels().catch(() => {
      // Model list is optional chrome; chat still works on the server default.
    })
  }, [reloadModels])

  async function pickModel(value: string) {
    const slash = value.indexOf("/")
    if (slash < 0) return
    const ref = { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
    modelRef.current = ref
    setModel(ref)
    if (!sessionID) return
    try {
      await client.session.switchModel({ sessionID, model: ref })
    } catch (cause) {
      setError(errorText(cause))
    }
  }

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
        const chosen = modelRef.current
        if (chosen) {
          try {
            await client.session.switchModel({ sessionID: session.id, model: chosen })
          } catch {
            // Keep the server default if the chosen model is not routable.
          }
        }
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
          <Select
            className="model-select"
            placeholder="选择模型"
            value={model ? `${model.providerID}/${model.id}` : undefined}
            options={modelOptions}
            onChange={(value) => pickModel(value)}
            popupMatchSelectWidth={false}
          />
          <Tooltip title="设置 API Key">
            <Button
              type="text"
              size="small"
              icon={<KeyOutlined />}
              onClick={() => setKeyOpen(true)}
            />
          </Tooltip>
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

        <Messages
          blocks={blocks}
          busy={busy}
          directory={conn.directory}
          onSuggestion={setDraft}
        />
      </main>

      <footer className="composer">
        <Sender
          className={busy ? "thinking" : undefined}
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

      <PermissionModal
        request={request}
        count={queue.length}
        onReply={(decision) => void reply(decision)}
      />

      <ApiKeyModal
        open={keyOpen}
        client={client}
        directory={conn.directory}
        currentProvider={model?.providerID}
        onClose={() => setKeyOpen(false)}
        onSaved={reloadModels}
      />
    </div>
  )
}

