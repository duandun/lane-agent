import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDownIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { Button, Flex, Popover, ScrollArea, Text, TextField } from '@radix-ui/themes';

export type PickerOption = {
  value: string;
  /** 参与搜索的纯文本。 */
  search: string;
  content: (selected: boolean) => ReactNode;
  /** 行尾操作按钮（编辑 / 删除），与主按钮平级，不能嵌套进去。 */
  actions?: ReactNode;
};

/** 带搜索的下拉选择器；行内容和行尾操作都由调用方提供。 */
export default function OptionPicker({
  value,
  trigger,
  triggerClassName,
  placeholder,
  options,
  onSelect,
  addLabel,
  addIcon,
  onAdd,
  notice,
  width = 300,
}: {
  value: string | null;
  trigger: ReactNode;
  triggerClassName?: string;
  placeholder: string;
  options: PickerOption[];
  onSelect: (value: string) => void;
  addLabel?: string;
  addIcon?: ReactNode;
  onAdd?: () => void;
  notice?: ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? options.filter((option) => option.search.toLowerCase().includes(text)) : options;
  }, [options, query]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger>
        <Button variant="soft" color="gray" size="2" className={triggerClassName}>
          <Flex align="center" gap="1" className="min-w-0">
            <Text size="2" truncate>
              {trigger}
            </Text>
            <ChevronDownIcon />
          </Flex>
        </Button>
      </Popover.Trigger>
      <Popover.Content side="bottom" align="start" width={`${width}px`} className="p-2">
        <TextField.Root
          size="1"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        >
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>
        {notice && <div className="mt-2">{notice}</div>}
        <ScrollArea type="auto" style={{ maxHeight: 300 }} className="mt-2">
          <Flex direction="column" gap="1">
            {filtered.map((option) => {
              const selected = option.value === value;
              return (
                <div
                  key={option.value}
                  className={`group flex items-center rounded-md ${
                    selected ? 'bg-(--panel-2)' : 'hover:bg-(--panel-2)'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(option.value);
                      setOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left [font:inherit]"
                  >
                    {option.content(selected)}
                  </button>
                  {option.actions && (
                    <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                      {option.actions}
                    </div>
                  )}
                </div>
              );
            })}
            {!filtered.length && (
              <div className="px-2 py-6 text-center">
                <Text size="1" color="gray">
                  没有匹配项
                </Text>
              </div>
            )}
          </Flex>
        </ScrollArea>
        {addLabel && onAdd && (
          <button
            type="button"
            onClick={() => {
              onAdd();
              setOpen(false);
            }}
            className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-(--muted) hover:bg-(--panel-2)"
          >
            {addIcon}
            {addLabel}
          </button>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
