import { useMemo, useState } from 'react';
import { GridIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { Button, Flex, Popover, ScrollArea, Text, TextField } from '@radix-ui/themes';
import type { SkillInfo } from '@opencode/client';

/** 输入框左下角的 skill 选择器：Popover + 搜索，单选，选中项显示为 Sender 的 skill chip。 */
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

  const sortedSkills = useMemo(() => {
    const list = [...skills];
    const index = list.findIndex((item) => item.name === 'agent-desktop');
    if (index > -1) list.unshift(list.splice(index, 1)[0]);
    return list;
  }, [skills]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return sortedSkills;
    return sortedSkills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(value) ||
        (skill.description ?? '').toLowerCase().includes(value)
    );
  }, [query, sortedSkills]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onRefresh?.();
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger>
        <Button variant="ghost" color="gray" size="1">
          <Flex align="center" gap="1">
            <GridIcon />
            技能
          </Flex>
        </Button>
      </Popover.Trigger>
      <Popover.Content side="top" align="start" width="400px" className="p-2">
        <TextField.Root
          size="1"
          placeholder="搜索 skill"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
          onKeyDown={(event) => {
            // 中文输入法确认候选词时也会发 Enter，不能当成选择。
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            const first = filtered[0];
            if (!first) return;
            event.preventDefault();
            onSelect(first);
            setOpen(false);
          }}
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>
        <ScrollArea type="auto" style={{ maxHeight: 330 }} className="mt-2">
          <Flex direction="column" gap="1">
            {filtered.map((skill) => {
              const active = selected?.id === skill.id;
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => {
                    onSelect(skill);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left [font:inherit] ${
                    active ? 'bg-(--panel-2)' : 'hover:bg-(--panel-2)'
                  }`}
                >
                  <Flex align="center" gap="2">
                    <GridIcon className="shrink-0 text-(--muted)" />
                    <Text size="2" weight="bold" className="font-mono">
                      {skill.name}
                    </Text>
                  </Flex>
                  {skill.description && (
                    <Text size="1" color="gray" truncate className="ml-5">
                      {skill.description}
                    </Text>
                  )}
                </button>
              );
            })}
            {!filtered.length && (
              <div className="px-2 py-6 text-center">
                <Text size="1" color="gray">
                  没有匹配的 skill
                </Text>
              </div>
            )}
          </Flex>
        </ScrollArea>
      </Popover.Content>
    </Popover.Root>
  );
}
