import { useEffect, useRef, useState } from 'react';
import { Alert, App as AntdApp, Button, Flex, Input, Modal, Typography } from 'antd';
import { appBridge, type SaveSkillResult } from '../lib/bridge';
import type { Block } from '../lib/blocks';
import type { Client } from '../lib/client';
import { errorText } from '../lib/error';
import { draftSkill, parseSkill, skillPrompt } from '../lib/skillDraft';
import type { SavedModel } from '../lib/store';
import Field from './Field';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * 把当前轮次的操作整理成 SKILL.md 草稿，
 * 用户确认后写入 ~/.config/opencode/skills/<name>/SKILL.md。
 */
export default function SaveSkillModal({
  open,
  blocks,
  client,
  model,
  onClose,
  onSaved,
}: {
  open: boolean;
  blocks: Block[];
  client?: Client;
  model?: SavedModel | null;
  onClose: () => void;
  onSaved: (saved: { path: string; name: string }) => void;
}) {
  const { message } = AntdApp.useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  // 打开时快照 blocks，流式输出继续追加也不能覆盖用户已经改过的草稿。
  const blocksRef = useRef(blocks);
  const binRef = useRef<string | undefined>(undefined);
  const touchedRef = useRef(false);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    touchedRef.current = false;
    const base = draftSkill(blocksRef.current);
    setName(base.name);
    setDescription(base.description);
    setBody(base.body);
    setWarnings(base.warnings);
    setError(null);

    // 装好 agent-desktop 时用绝对路径，和内置 skill 的命令重写保持一致。
    void appBridge?.skills
      .info()
      .then((info) => {
        binRef.current = info.agentDesktopBin ?? undefined;
        if (cancelled || touchedRef.current || !info.agentDesktopBin) return;
        const next = draftSkill(blocksRef.current, { bin: info.agentDesktopBin });
        setName(next.name);
        setDescription(next.description);
        setBody(next.body);
        setWarnings(next.warnings);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open]);

  // 让当前模型看完整对话重写草稿；失败时保留手动可编辑的规则草稿。
  async function rewrite() {
    if (!client) return;
    setRewriting(true);
    setError(null);
    try {
      const base = draftSkill(blocksRef.current, { bin: binRef.current });
      const result = await client.experimental.generate.text({
        prompt: skillPrompt(blocksRef.current, { bin: binRef.current, draft: base }),
        model: model ? { providerID: model.providerID, id: model.id } : undefined,
      });
      const parsed = parseSkill(result.text);
      if (!parsed) throw new Error('模型返回的内容不是 SKILL.md，请重试或手动编辑');
      if (parsed.name) setName(parsed.name);
      if (parsed.description) setDescription(parsed.description);
      setBody(parsed.body);
      setWarnings([]);
      touchedRef.current = true;
      message.success('已用 AI 重写草稿');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setRewriting(false);
    }
  }

  async function save(overwrite = false) {
    if (!appBridge) return;
    if (!NAME_RE.test(name)) {
      setError('名称只能是 kebab-case：小写字母、数字和 -');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result: SaveSkillResult = await appBridge.skills.save({
        name,
        description,
        body,
        overwrite,
      });
      if (result.ok) {
        message.success(`已保存到 ${result.path}`);
        onSaved({ path: result.path, name });
        onClose();
        return;
      }
      if (result.reason === 'exists' && !overwrite) {
        Modal.confirm({
          title: '同名 skill 已存在',
          content: `覆盖 ${name} 的 SKILL.md？`,
          okText: '覆盖',
          cancelText: '取消',
          onOk: () => save(true),
        });
        return;
      }
      setError(result.message ?? '保存失败');
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="存为技能"
      open={open}
      okText="保存"
      cancelText="取消"
      width={720}
      confirmLoading={saving}
      okButtonProps={{ disabled: !appBridge || rewriting }}
      onCancel={onClose}
      onOk={() => void save()}
    >
      <Flex vertical gap={12}>
        <Flex justify="space-between" align="center" gap={12}>
          <Typography.Text type="secondary" className="text-xs!">
            把本轮操作写成可复用的 skill；保存后刷新技能列表即可使用。
          </Typography.Text>
          <Button
            size="small"
            loading={rewriting}
            disabled={!client}
            onClick={() => void rewrite()}
          >
            用 AI 重写
          </Button>
        </Flex>

        {warnings.length > 0 && (
          <Alert
            type="warning"
            showIcon
            title="草稿里有需要确认的地方"
            description={
              <ul className="m-0 pl-4">
                {warnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            }
          />
        )}
        {error && <Alert type="error" showIcon title={error} />}

        <Field label="名称（kebab-case）">
          <Input
            value={name}
            onChange={(event) => {
              touchedRef.current = true;
              setName(event.target.value);
            }}
          />
        </Field>
        <Field label="描述（决定 agent 何时加载它）">
          <Input.TextArea
            value={description}
            onChange={(event) => {
              touchedRef.current = true;
              setDescription(event.target.value);
            }}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </Field>
        <Field label="SKILL.md 正文">
          <Input.TextArea
            value={body}
            onChange={(event) => {
              touchedRef.current = true;
              setBody(event.target.value);
            }}
            rows={16}
            className="font-mono text-xs!"
          />
        </Field>
      </Flex>
    </Modal>
  );
}
