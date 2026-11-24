import { useEffect, useState } from 'react';
import { Alert, App as AntdApp, Flex, Input, Modal, Typography } from 'antd';
import { appBridge, type SaveSkillResult } from '../lib/bridge';
import type { Block } from '../lib/blocks';
import { errorText } from '../lib/error';
import { draftSkill } from '../lib/skillDraft';
import Field from './Field';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * 把本次会话里的 agent-desktop 操作整理成 SKILL.md 草稿，
 * 用户确认后写入 ~/.config/opencode/skills/<name>/SKILL.md。
 */
export default function SaveSkillModal({
  open,
  blocks,
  onClose,
  onSaved,
}: {
  open: boolean;
  blocks: Block[];
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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const base = draftSkill(blocks);
    setName(base.name);
    setDescription(base.description);
    setBody(base.body);
    setWarnings(base.warnings);
    setError(null);

    // 装好 agent-desktop 时用绝对路径，和内置 skill 的命令重写保持一致。
    void appBridge?.skills
      .info()
      .then((info) => {
        if (cancelled || !info.agentDesktopBin) return;
        const next = draftSkill(blocks, { bin: info.agentDesktopBin });
        setName(next.name);
        setDescription(next.description);
        setBody(next.body);
        setWarnings(next.warnings);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open, blocks]);

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
      okButtonProps={{ disabled: !appBridge }}
      onCancel={onClose}
      onOk={() => void save()}
    >
      <Flex vertical gap={12}>
        <Typography.Text type="secondary" className="text-xs!">
          把本次 agent-desktop 操作写成可复用的 skill；保存后刷新技能列表即可使用。
        </Typography.Text>

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
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="描述（决定 agent 何时加载它）">
          <Input.TextArea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </Field>
        <Field label="SKILL.md 正文">
          <Input.TextArea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={16}
            className="font-mono text-xs!"
          />
        </Field>
      </Flex>
    </Modal>
  );
}
