import { useEffect, useState } from 'react';
import { App as AntdApp, Flex, Input, Modal, Typography } from 'antd';
import type { Client } from '../lib/client';
import { useAppStore, type CustomModel } from '../lib/store';
import { errorText } from '../lib/error';
import { loadModelConfig, saveModelConfig, type ProviderConfig } from '../lib/opencodeConfig';
import Field from './Field';

const PACKAGE = '@opencode/ai/providers/openai-compatible';

/**
 * 自定义 OpenAI 兼容供应商的编辑弹窗：合并写入项目的 opencode.json、
 * 保存 Key 并重载服务端配置。editing 会回填表单并锁定 Provider ID。
 */
export default function CustomModelModal({
  open,
  client,
  directory,
  current,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  client: Client;
  directory: string;
  current: { providerID: string; id: string } | null;
  editing: CustomModel | null;
  onClose: () => void;
  onSaved: (model: CustomModel) => Promise<void>;
}) {
  const { message } = AntdApp.useApp();
  const saveCustomModel = useAppStore((state) => state.saveCustomModel);
  const [providerID, setProviderID] = useState('');
  const [modelID, setModelID] = useState('');
  const [name, setName] = useState('');
  const [baseURL, setBaseURL] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProviderID(editing?.providerID ?? '');
    setModelID(editing?.modelID ?? '');
    setName(editing?.name ?? '');
    setBaseURL(editing?.baseURL ?? '');
    setApiKey('');
  }, [open, editing]);

  async function save() {
    const pid = providerID.trim();
    const mid = modelID.trim();
    const url = baseURL.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pid)) {
      message.error('Provider ID 只能包含字母、数字、. _ -');
      return;
    }
    if (!mid) {
      message.error('请填写模型 ID');
      return;
    }
    if (!/^https?:\/\//.test(url)) {
      message.error('接口地址必须以 http:// 或 https:// 开头');
      return;
    }

    setSaving(true);
    try {
      const config = await loadModelConfig(client, directory);
      const providers = {
        ...((config.providers as Record<string, ProviderConfig> | undefined) ?? {}),
      };
      const existing = providers[pid] ?? {};
      const models = { ...existing.models };
      // 编辑时改了模型 ID，就把旧模型从配置里挪走，避免留下失效条目。
      if (editing && editing.modelID !== mid) delete models[editing.modelID];
      models[mid] = { name: mid };
      // 同一个 Provider 下可以有任意多个模型，保留已有的 models 和其它设置。
      providers[pid] = {
        ...existing,
        name: name.trim() || existing.name || pid,
        env: [`${pid.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_API_KEY`],
        package: PACKAGE,
        settings: { ...existing.settings, baseURL: url },
        models,
      };
      config.providers = providers;

      if (apiKey.trim()) {
        await client.credential.create({
          integrationID: pid,
          label: pid,
          value: { type: 'key', key: apiKey.trim() },
          activate: true,
        });
      }

      await saveModelConfig(client, directory, config);

      const saved: CustomModel = {
        providerID: pid,
        modelID: mid,
        name: name.trim() || pid,
        baseURL: url,
      };
      saveCustomModel(saved, editing ?? undefined);
      message.success('自定义模型已保存');
      setApiKey('');
      onClose();
      await onSaved(saved);
    } catch (cause) {
      message.error(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editing ? '编辑自定义模型' : '自定义模型'}
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
        <Typography.Text type="secondary" className="text-xs!">
          当前模型：{current ? `${current.providerID}/${current.id}` : '未选择'}
        </Typography.Text>
        <Field label="Provider ID">
          <Input
            value={providerID}
            onChange={(event) => setProviderID(event.target.value)}
            placeholder="custom-deepseek"
            disabled={!!editing}
          />
        </Field>
        <Field label="模型 ID">
          <Input
            value={modelID}
            onChange={(event) => setModelID(event.target.value)}
            placeholder="deepseek-chat"
          />
        </Field>
        <Field label="显示名称">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="可选，默认使用 Provider ID"
          />
        </Field>
        <Field label="接口地址">
          <Input
            value={baseURL}
            onChange={(event) => setBaseURL(event.target.value)}
            placeholder="https://api.deepseek.com/v1"
          />
        </Field>
        <Field label="API Key（留空表示沿用已保存的 Key）">
          <Input.Password
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
          />
        </Field>
        <Typography.Text type="secondary" className="text-xs!">
          保存会合并写入 {directory || 'server 默认目录'}/opencode.json 并重新加载配置；Key 存在
          server 凭据库。
        </Typography.Text>
      </Flex>
    </Modal>
  );
}
