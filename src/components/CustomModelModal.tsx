import { useEffect, useState } from "react"
import { App as AntdApp, Flex, Input, Modal, Typography } from "antd"
import type { Client } from "../lib/client"
import { saveCustomModel, type CustomModel } from "../lib/customModels"
import { errorText } from "../lib/error"

const PACKAGE = "@opencode/ai/providers/openai-compatible"

export default function CustomModelModal({
  open,
  client,
  directory,
  current,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  client: Client
  directory: string
  current: { providerID: string; id: string } | null
  editing: CustomModel | null
  onClose: () => void
  onSaved: (model: CustomModel) => Promise<void>
}) {
  const { message } = AntdApp.useApp()
  const [providerID, setProviderID] = useState("")
  const [modelID, setModelID] = useState("")
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setProviderID(editing?.providerID ?? "")
    setModelID(editing?.modelID ?? "")
    setName(editing?.name ?? "")
    setBaseURL(editing?.baseURL ?? "")
    setApiKey("")
  }, [open, editing])

  async function save() {
    const pid = providerID.trim()
    const mid = modelID.trim()
    const url = baseURL.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pid)) {
      message.error("Provider ID 只能包含字母、数字、. _ -")
      return
    }
    if (!mid) {
      message.error("请填写模型 ID")
      return
    }
    if (!/^https?:\/\//.test(url)) {
      message.error("接口地址必须以 http:// 或 https:// 开头")
      return
    }

    setSaving(true)
    try {
      const location = directory ? { directory } : undefined

      // Merge into the existing project config; never replace other settings.
      let path = "opencode.json"
      let config: Record<string, unknown> = {}
      for (const candidate of ["opencode.json", "opencode.jsonc"]) {
        try {
          const bytes = await client.file.read({ location, path: candidate })
          const text = new TextDecoder().decode(bytes)
          try {
            const parsed = JSON.parse(text || "{}")
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
              throw new Error("根节点不是对象")
            }
            config = parsed as Record<string, unknown>
          } catch {
            throw new Error(`${candidate} 解析失败（可能含注释），请手动编辑该文件`)
          }
          path = candidate
          break
        } catch (cause) {
          if ((cause as Error)?.name === "FileNotFoundError") continue
          throw cause
        }
      }

      const providers = { ...((config.providers as Record<string, unknown> | undefined) ?? {}) }
      providers[pid] = {
        name: name.trim() || pid,
        env: [`${pid.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}_API_KEY`],
        package: PACKAGE,
        settings: { baseURL: url },
        models: { [mid]: { name: mid } },
      }
      config.providers = providers
      await client.file.write({
        location,
        path,
        payload: new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`),
      })

      if (apiKey.trim()) {
        await client.credential.create({
          integrationID: pid,
          label: pid,
          value: { type: "key", key: apiKey.trim() },
          activate: true,
        })
      }

      await client.location.reload({
        headers: directory ? { "x-opencode-directory": directory } : undefined,
      })

      const saved: CustomModel = { providerID: pid, modelID: mid, name: name.trim() || pid, baseURL: url }
      saveCustomModel(saved)
      message.success("自定义模型已保存")
      setApiKey("")
      onClose()
      await onSaved(saved)
    } catch (cause) {
      message.error(errorText(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? "编辑自定义模型" : "自定义模型"}
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: !providerID.trim() || !modelID.trim() || !baseURL.trim() }}
      onCancel={onClose}
      onOk={() => void save()}
      width={460}
    >
      <Flex vertical gap={12}>
        <Typography.Text type="secondary" className="small">
          当前模型：{current ? `${current.providerID}/${current.id}` : "未选择"}
        </Typography.Text>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary" className="small">
            Provider ID
          </Typography.Text>
          <Input
            value={providerID}
            onChange={(event) => setProviderID(event.target.value)}
            placeholder="custom-deepseek"
            disabled={!!editing}
          />
        </Flex>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary" className="small">
            模型 ID
          </Typography.Text>
          <Input
            value={modelID}
            onChange={(event) => setModelID(event.target.value)}
            placeholder="deepseek-chat"
          />
        </Flex>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary" className="small">
            显示名称
          </Typography.Text>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="可选，默认使用 Provider ID"
          />
        </Flex>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary" className="small">
            接口地址
          </Typography.Text>
          <Input
            value={baseURL}
            onChange={(event) => setBaseURL(event.target.value)}
            placeholder="https://api.deepseek.com/v1"
          />
        </Flex>
        <Flex vertical gap={6}>
          <Typography.Text type="secondary" className="small">
            API Key（留空表示沿用已保存的 Key）
          </Typography.Text>
          <Input.Password
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </Flex>
        <Typography.Text type="secondary" className="small">
          保存会合并写入 {directory || "server 默认目录"}/opencode.json 并重新加载配置；Key 存在 server 凭据库。
        </Typography.Text>
      </Flex>
    </Modal>
  )
}
