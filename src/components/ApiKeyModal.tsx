import { useEffect, useState } from "react"
import { App as AntdApp, Flex, Input, Modal, Select, Typography } from "antd"
import type { Client } from "../lib/client"
import { errorText } from "../lib/error"

type Option = { value: string; label: string }

export default function ApiKeyModal({
  open,
  client,
  directory,
  currentProvider,
  onClose,
  onSaved,
}: {
  open: boolean
  client: Client
  directory: string
  currentProvider?: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { message } = AntdApp.useApp()
  const [provider, setProvider] = useState<string>()
  const [key, setKey] = useState("")
  const [providers, setProviders] = useState<Option[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const location = directory ? { directory } : undefined
      try {
        const response = await client.integration.list({ location })
        if (cancelled) return
        // Integrations expose the providers a key can be stored for; the active
        // provider list omits ones that have no credential yet.
        const options = response.data
          .filter(
            (item) => item.id !== "opencode" && item.methods.some((method) => method.type === "key"),
          )
          .map((item) => ({ value: item.id, label: item.name }))
        setProviders(options)
        setProvider(
          currentProvider && options.some((option) => option.value === currentProvider)
            ? currentProvider
            : undefined,
        )
      } catch (cause) {
        if (!cancelled) message.error(errorText(cause))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, client, directory, currentProvider, message])

  async function save() {
    const value = key.trim()
    if (!provider || !value) return
    setSaving(true)
    try {
      await client.credential.create({
        integrationID: provider,
        label: provider,
        value: { type: "key", key: value },
        activate: true,
      })
      message.success("API Key 已保存")
      setKey("")
      onClose()
      await onSaved()
    } catch (cause) {
      message.error(errorText(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="设置 API Key"
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: !provider || !key.trim() }}
      onCancel={() => {
        setKey("")
        onClose()
      }}
      onOk={() => void save()}
    >
      <Flex vertical gap={12}>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary" className="small">
            供应商
          </Typography.Text>
          <Select
            value={provider}
            onChange={setProvider}
            options={providers}
            placeholder="搜索并选择供应商"
            showSearch
            style={{ width: "100%" }}
            popupMatchSelectWidth={false}
          />
        </Flex>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary" className="small">
            API Key
          </Typography.Text>
          <Input.Password
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </Flex>
        <Typography.Text type="secondary" className="small">
          Key 保存在 opencode server 的凭据库里，不会写进本地配置文件。
        </Typography.Text>
      </Flex>
    </Modal>
  )
}
