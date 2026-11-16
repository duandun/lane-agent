import { Button, Modal, Space, Tag, Typography } from "antd"
import type { PermissionRequest } from "@opencode/client"

export default function PermissionModal({
  request,
  count,
  onReply,
}: {
  request?: PermissionRequest
  count: number
  onReply: (decision: "once" | "always" | "reject") => void
}) {
  return (
    <Modal
      open={!!request}
      title={
        <Space>
          需要授权
          {count > 1 && <Tag color="blue">{count} 个待处理</Tag>}
        </Space>
      }
      closable={false}
      mask={{ closable: false }}
      keyboard={false}
      footer={[
        <Button key="reject" danger onClick={() => onReply("reject")}>
          拒绝
        </Button>,
        <Button key="once" onClick={() => onReply("once")}>
          仅本次
        </Button>,
        <Button key="always" type="primary" onClick={() => onReply("always")}>
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
  )
}
