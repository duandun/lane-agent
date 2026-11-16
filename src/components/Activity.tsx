import { useState } from "react"
import {
  BulbOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CodeOutlined,
  DownOutlined,
  LoadingOutlined,
} from "@ant-design/icons"
import Markdown from "./Markdown"
import type { Block } from "../lib/blocks"

export type ActivityBlock = Extract<Block, { kind: "reasoning" | "tool" }>

export default function Activity({ blocks }: { blocks: ActivityBlock[] }) {
  return (
    <div className="activity">
      {blocks.map((block) => (
        <ProcessRow key={block.id} block={block} />
      ))}
    </div>
  )
}

/**
 * Compact disclosure row, DeepSeek Harness style: icon, label and a one-line
 * preview when folded; clicking the header reveals the full content.
 */
function ProcessRow({ block }: { block: ActivityBlock }) {
  const [open, setOpen] = useState(false)
  const reasoning = block.kind === "reasoning"
  const text = reasoning ? block.text : block.detail
  const preview = text.trim().split("\n")[0] ?? ""

  return (
    <div className={`process-row${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="process-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="process-icon">{reasoning ? <BulbOutlined /> : <CodeOutlined />}</span>
        <span className={`process-title${reasoning ? "" : " mono"}`}>
          {reasoning ? "思考" : block.name}
        </span>
        {!open && preview && (
          <span className={`process-preview${reasoning ? "" : " mono"}`}>{preview}</span>
        )}
        {!reasoning && (
          <span className={`process-status ${block.status}`}>
            {block.status === "running" ? (
              <LoadingOutlined spin />
            ) : block.status === "ok" ? (
              <CheckCircleFilled />
            ) : (
              <CloseCircleFilled />
            )}
          </span>
        )}
        <DownOutlined className="process-chevron" />
      </button>
      {open && text && (
        <div className={`process-body${reasoning ? " process-markdown" : " process-output"}`}>
          {reasoning ? <Markdown text={text} /> : text}
        </div>
      )}
    </div>
  )
}
