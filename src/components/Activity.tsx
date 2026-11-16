import { useEffect, useMemo, useRef, useState } from "react"
import { ThoughtChain, type ThoughtChainItemType } from "@ant-design/x"
import { BulbOutlined } from "@ant-design/icons"
import type { Block } from "../lib/blocks"

export type ActivityBlock = Extract<Block, { kind: "reasoning" | "tool" }>

export default function Activity({ blocks }: { blocks: ActivityBlock[] }) {
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
