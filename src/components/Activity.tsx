import { useEffect, useState } from "react"
import { BulbOutlined, CodeOutlined, ThunderboltFilled } from "@ant-design/icons"
import DisclosureRow from "./DisclosureRow"
import Markdown from "./Markdown"
import type { Block } from "../lib/blocks"

export type ActivityBlock = Extract<Block, { kind: "reasoning" | "tool" }>

/**
 * 一轮运行中的思考和工具调用，折叠成单个「已处理」行。
 * active 时自动展开，运行结束后自动收起。
 */
export default function Activity({
  blocks,
  active,
}: {
  blocks: ActivityBlock[]
  active: boolean
}) {
  const [open, setOpen] = useState(active)

  // 运行中展开，结束后折叠成一行。
  useEffect(() => {
    setOpen(active)
  }, [active])

  const tools = blocks.filter((block) => block.kind === "tool").length
  const thinks = blocks.length - tools
  const summary = [thinks ? `${thinks} 次思考` : "", tools ? `${tools} 个工具` : ""]
    .filter(Boolean)
    .join(" · ")
  const failed = blocks.some((block) => block.kind === "tool" && block.status === "error")

  return (
    <DisclosureRow
      icon={<ThunderboltFilled />}
      title={active ? "处理中…" : "已处理"}
      preview={summary}
      status={active ? "running" : failed ? "error" : "ok"}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      headClassName="group-head"
    >
      <div className="activity">
        {blocks.map((block) => (
          <ProcessRow key={block.id} block={block} />
        ))}
      </div>
    </DisclosureRow>
  )
}

/** 活动组内的一条思考或工具调用。 */
function ProcessRow({ block }: { block: ActivityBlock }) {
  const [open, setOpen] = useState(false)
  const reasoning = block.kind === "reasoning"
  const text = reasoning ? block.text : block.detail
  const preview = text.trim().split("\n")[0] ?? ""

  return (
    <DisclosureRow
      icon={reasoning ? <BulbOutlined /> : <CodeOutlined />}
      title={reasoning ? "思考" : block.name}
      titleMono={!reasoning}
      preview={preview}
      previewMono={!reasoning}
      status={reasoning ? undefined : block.status}
      open={open}
      onToggle={() => setOpen((value) => !value)}
    >
      {text && (
        <div className={`process-body${reasoning ? " process-markdown" : " process-output"}`}>
          {reasoning ? <Markdown text={text} /> : text}
        </div>
      )}
    </DisclosureRow>
  )
}
