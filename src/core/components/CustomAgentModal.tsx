import { useEffect, useState } from 'react';
import { Button, Callout, Dialog, Flex, Select, Text, TextArea, TextField } from '@radix-ui/themes';
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
  const saveCustomAgent = useAppStore((state) => state.saveCustomAgent);
  const [id, setID] = useState('');
  const [description, setDescription] = useState('');
  const [system, setSystem] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setID(editing?.id ?? '');
    setDescription(editing?.description ?? '');
    setSystem(editing?.system ?? '');
    setModel(editing?.model || DEFAULT_MODEL);
    setError(null);
  }, [open, editing]);

  async function save() {
    const agentID = id.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(agentID)) {
      setError('Agent ID 只能包含字母、数字、. _ -');
      return;
    }
    if (!system.trim()) {
      setError('请填写角色提示词');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const saved: CustomAgent = {
        id: agentID,
        description: description.trim(),
        system: system.trim(),
        model: model === DEFAULT_MODEL ? '' : model,
      };
      await saveAgentConfig(client, directory, saved, editing?.id);
      saveCustomAgent(saved, editing?.id);
      onClose();
      await onSaved(saved);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Content maxWidth="520px" aria-describedby={undefined}>
        <Dialog.Title>{editing ? '编辑角色' : '新增角色'}</Dialog.Title>
        <Flex direction="column" gap="3" mt="3">
          <Field label="角色名称">
            <TextField.Root
              value={id}
              onChange={(event) => setID(event.target.value)}
              placeholder="code-reviewer"
              disabled={!!editing}
            />
          </Field>
          <Field label="描述（可选，用于下拉里展示）">
            <TextField.Root
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="只做代码审查"
            />
          </Field>
          <Field label="角色提示词">
            <TextArea
              value={system}
              onChange={(event) => setSystem(event.target.value)}
              placeholder="你是资深代码审查员，输出简洁、只挑关键问题……"
              rows={4}
            />
          </Field>
          <Field label="模型（可选）">
            <Select.Root value={model} onValueChange={setModel}>
              <Select.Trigger />
              <Select.Content>
                <Select.Item value={DEFAULT_MODEL}>跟随默认模型</Select.Item>
                {modelOptions.map((item) => (
                  <Select.Item key={item.value} value={item.value}>
                    {item.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Field>
          <Text size="1" color="gray">
            保存会合并写入 {directory || 'server 默认目录'}/opencode.json 并重新加载配置；角色切换在
            顶部角色下拉里进行。
          </Text>
          {error && (
            <Callout.Root color="red" size="1">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
        </Flex>
        <Flex justify="end" gap="2" mt="4">
          <Button variant="soft" color="gray" onClick={onClose}>
            取消
          </Button>
          <Button
            loading={saving}
            disabled={!id.trim() || !system.trim()}
            onClick={() => void save()}
          >
            保存
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
