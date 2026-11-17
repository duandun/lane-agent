import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Input, Typography, Tooltip, type InputRef, type MenuProps } from 'antd';
import { AppstoreOutlined, SearchOutlined } from '@ant-design/icons';
import type { SkillInfo } from '@opencode/client';

/** 输入框左下角的 skill 选择器：Dropdown + 搜索，单选，选中项显示为 Sender 的 skill chip。 */
export default function SkillPicker({
  skills,
  selected,
  onSelect,
  onRefresh,
}: {
  skills: SkillInfo[];
  selected: SkillInfo | null;
  onSelect: (skill: SkillInfo | null) => void;
  onRefresh?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<InputRef>(null);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(value) ||
        (skill.description ?? '').toLowerCase().includes(value)
    );
  }, [query, skills]);

  const items: MenuProps['items'] = filtered.map((skill) => ({
    key: skill.id,
    label: (
      <div className="w-[300px] min-w-0 py-0.5">
        <Typography.Text strong className="font-mono text-[13px]">
          {skill.name}
        </Typography.Text>
        {skill.description && (
          <Tooltip
            title={<div className="w-full line-clamp-5">{skill.description}</div>}
            placement="topLeft"
            styles={{ root: { maxWidth: 'none' }, container: { width: 340 } }}
          >
            <div className="w-full truncate text-xs text-(--muted)">{skill.description}</div>
          </Tooltip>
        )}
      </div>
    ),
  }));

  useEffect(() => {
    if (!open) return;
    // 弹出层经 Portal 在下一帧才挂载，等一帧再聚焦。
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Dropdown
      trigger={['click']}
      placement="topLeft"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onRefresh?.();
      }}
      menu={{
        items,
        selectable: true,
        selectedKeys: selected ? [selected.id] : [],
        // antd 默认给下拉菜单加了 max-height + overflow，会和外层滚动容器嵌套。
        style: { width: '100%', background: 'transparent', maxHeight: 'none' },
        onClick: ({ key }) => {
          onSelect(skills.find((skill) => skill.id === key) ?? null);
          setOpen(false);
        },
      }}
      popupRender={(menu) => (
        <div className="w-[340px] rounded-lg border border-(--line) bg-(--panel) p-2 shadow-xl">
          <Input
            ref={inputRef}
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索 skill"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="mt-2 max-h-[320px] overflow-y-auto overscroll-contain">{menu}</div>
        </div>
      )}
    >
      <Button type="text" size="small" icon={<AppstoreOutlined />}>
        技能
      </Button>
    </Dropdown>
  );
}
