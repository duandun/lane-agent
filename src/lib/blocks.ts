import type { SessionMessageInfo } from "@opencode/client"

export type Block =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "reasoning"; text: string }
  | { id: string; kind: "tool"; name: string; status: ToolStatus; detail: string }
  | { id: string; kind: "notice"; text: string }

export type ToolStatus = "running" | "ok" | "error"

/** Insert a block, or merge into the existing one with the same id. */
export function upsert(blocks: Block[], block: Block): Block[] {
  const index = blocks.findIndex((b) => b.id === block.id)
  if (index === -1) return [...blocks, block]
  const next = blocks.slice()
  next[index] = block
  return next
}

export function patch(blocks: Block[], id: string, fn: (block: Block) => Block): Block[] {
  const index = blocks.findIndex((b) => b.id === id)
  if (index === -1) return blocks
  const next = blocks.slice()
  next[index] = fn(next[index])
  return next
}

function toolStatus(status: string | undefined): ToolStatus {
  if (status === "completed") return "ok"
  if (status === "error") return "error"
  return "running"
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const item of content) {
    if (!item || typeof item !== "object") continue
    if ("type" in item && item.type === "text" && typeof item.text === "string") {
      parts.push(item.text)
    }
  }
  return parts.join("\n")
}

function toolDetail(state: unknown): string {
  if (!state || typeof state !== "object") return ""
  const value = state as Record<string, any>
  if (value.status === "completed" || value.status === "error") {
    return contentToText(value.content)
  }
  return value.input ? JSON.stringify(value.input, null, 2) : ""
}

/**
 * Rebuild the whole block list from server truth.
 * Used on session load and again after every run finishes, so the optimistic
 * event-driven list is reconciled with what the server actually persisted.
 */
export function blocksFromMessages(messages: SessionMessageInfo[]): Block[] {
  const blocks: Block[] = []

  for (const message of messages) {
    if (message.type === "user") {
      if (message.text.trim()) {
        blocks.push({ id: `msg:${message.id}`, kind: "user", text: message.text })
      }
      continue
    }

    if (message.type !== "assistant") continue

    message.content.forEach((part, index) => {
      if (part.type === "text") {
        if (!part.text.trim()) return
        blocks.push({ id: `msg:${message.id}:t${index}`, kind: "text", text: part.text })
        return
      }

      if (part.type === "reasoning") {
        if (!part.text.trim()) return
        blocks.push({ id: `msg:${message.id}:r${index}`, kind: "reasoning", text: part.text })
        return
      }

      if (part.type === "tool") {
        blocks.push({
          id: `tool:${part.id}`,
          kind: "tool",
          name: part.name,
          status: toolStatus(part.state?.status),
          detail: toolDetail(part.state),
        })
      }
    })
  }

  return blocks
}
