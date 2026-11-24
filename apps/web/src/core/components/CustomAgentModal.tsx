import { useEffect, useState } from 'react';
import { App as AntdApp, Flex, Input, Modal, Select, Typography } from 'antd';
import type { Client } from '../lib/client';
import { useAppStore, type CustomAgent } from '../lib/store';
import { errorText } from '../lib/error';
import { saveAgentConfig } from '../lib/opencodeConfig';
import Field from './Field';

const DEFAULT_MODEL = '__default__';

/**
 * 自定义 agent 角色编辑弹窗：合并写入项目的 opencode.json 的 agents，
 * 保存后重载服务端配置。editing 会回填并锁定 Agent ID。
 */
export default function CustomAgentModal({
  open,
  client,
  directory,
  modelOptions,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  client: Client;
  directory: string;
  modelOptions: { value: string; label: string }[];
  editing: CustomAgent | null;
  onClose: () => void;
  onSaved: (agent: CustomAgent) => Promise<void>;
}) {
  const { message } = AntdApp.useApp();
  const saveCustomAgent = useAppStore((state) => state.saveCustomAgent);
  const [id, setID] = useState('');
  const [description, setDescription] = useState('');
  const [system, setSystem] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setID(editing?.id ?? '');
    setDescription(editing?.description ?? '');
    setSystem(editing?.system ?? '');
    setModel(editing?.model || DEFAULT_MODEL);
  }, [open, editing]);

  async function save() {
    const agentID = id.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(agentID)) {
      message.error('Agent ID 只能包含字母、数字、. _ -');
      return;
    }
    if (!system.trim()) {
      message.error('请填写角色提示词');
      return;
    }

    setSaving(true);
    try {
      const saved: CustomAgent = {
        id: agentID,
        description: description.trim(),
        system: system.trim(),
        model: model === DEFAULT_MODEL ? '' : model,
      };
      await saveAgentConfig(client, directory, saved, editing?.id);
      saveCustomAgent(saved, editing?.id);
      message.success('角色已保存');
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
      title={editing ? '编辑角色' : '新增角色'}
      open={open}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      okButtonProps={{ disabled: !id.trim() || !system.trim() }}
      onCancel={onClose}
      onOk={() => void save()}
      width={520}
    >
      <Flex vertical gap={12}>
        <Field label="角色名称">
          <Input
            value={id}
            onChange={(event) => setID(event.target.value)}
            placeholder="code-reviewer"
            disabled={!!editing}
          />
        </Field>
        <Field label="描述（可选，用于下拉里展示）">
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="只做代码审查"
          />
        </Field>
        <Field label="角色提示词">
          <Input.TextArea
            value={system}
            onChange={(event) => setSystem(event.target.value)}
            placeholder="你是资深代码审查员，输出简洁、只挑关键问题……"
            autoSize={{ minRows: 4, maxRows: 8 }}
          />
        </Field>
        <Field label="模型（可选）">
          <Select
            value={model}
            onChange={setModel}
            options={[
              { value: DEFAULT_MODEL, label: '跟随默认模型' },
              ...modelOptions.map((item) => ({ value: item.value, label: item.label })),
            ]}
            showSearch
            optionFilterProp="label"
            popupMatchSelectWidth={false}
          />
        </Field>
        <Typography.Text type="secondary" className="text-xs!">
          保存会合并写入 {directory || 'server 默认目录'}/opencode.json 并重新加载配置；角色切换在
          顶部角色下拉里进行。
        </Typography.Text>
      </Flex>
    </Modal>
  );
}
