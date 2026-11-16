import type { ReactNode } from "react"
import {
  CheckCircleFilled,
  CloseCircleFilled,
  DownOutlined,
  LoadingOutlined,
} from "@ant-design/icons"

export type RowStatus = "running" | "ok" | "error"

/**
 * DeepSeek Harness 风格的紧凑折叠行：图标、标题和折叠时的一行预览；
 * 点击头部展开内容。
 */
export default function DisclosureRow({
  icon,
  title,
  titleMono = false,
  preview,
  previewMono = false,
  status,
  open,
  onToggle,
  headClassName,
  children,
}: {
  icon: ReactNode
  title: ReactNode
  titleMono?: boolean
  preview?: string
  previewMono?: boolean
  status?: RowStatus
  open: boolean
  onToggle: () => void
  headClassName?: string
  children?: ReactNode
}) {
  return (
    <div className={`process-row${open ? " is-open" : ""}`}>
      <button
        type="button"
        className={`process-head${headClassName ? ` ${headClassName}` : ""}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="process-icon">{icon}</span>
        <span className={`process-title${titleMono ? " mono" : ""}`}>{title}</span>
        {!open && preview && (
          <span className={`process-preview${previewMono ? " mono" : ""}`}>{preview}</span>
        )}
        {status && (
          <span className={`process-status ${status}`}>
            {status === "running" ? (
              <LoadingOutlined spin />
            ) : status === "ok" ? (
              <CheckCircleFilled />
            ) : (
              <CloseCircleFilled />
            )}
          </span>
        )}
        <DownOutlined className="process-chevron" />
      </button>
      {open && children}
    </div>
  )
}
