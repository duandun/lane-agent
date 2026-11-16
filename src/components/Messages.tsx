import { useCallback, useMemo } from "react"
import { Avatar, App as AntdApp } from "antd"
import {
  Actions,
  Bubble,
  Prompts,
  Welcome,
  type BubbleItemType,
  type PromptsItemType,
} from "@ant-design/x"
import {
  BulbOutlined,
  CopyOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  RobotOutlined,
  ThunderboltFilled,
  UserOutlined,
} from "@ant-design/icons"
import Markdown from "./Markdown"
import Activity, { type ActivityBlock } from "./Activity"
import type { Block } from "../lib/blocks"

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

export default function Messages({
  blocks,
  busy,
  directory,
  onSuggestion,
}: {
  blocks: Block[]
  busy: boolean
  directory: string
  onSuggestion: (text: string) => void
}) {
  const { message } = AntdApp.useApp()

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

  if (blocks.length === 0 && !busy) {
    return (
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
          description={`已连接 ${directory}，在下面描述你想做的事。`}
        />
        <Prompts
          title="或者试试这些"
          items={SUGGESTIONS}
          vertical
          onItemClick={({ data }) => onSuggestion(String(data.description ?? data.label ?? ""))}
        />
      </div>
    )
  }

  return (
    <Bubble.List
      className="bubbles"
      items={bubbleItems}
      role={roles}
      autoScroll
      style={{ height: "100%" }}
    />
  )
}
