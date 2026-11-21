import { useEffect, useState } from 'react';
import { Badge, Button, Flex, Link, Text, TextField } from '@radix-ui/themes';
import type { FormAnswer, FormField, FormInfo, FormValue } from '@opencode/client';

type Answers = Record<string, FormValue | undefined>;

function initialAnswers(form: FormInfo): Answers {
  const answers: Answers = {};
  for (const field of form.fields) {
    if (field.type === 'external') continue;
    if ('default' in field && field.default !== undefined) {
      answers[field.key] = field.default as FormValue;
    } else if (field.type === 'multiselect') {
      answers[field.key] = [];
    } else if (field.type === 'boolean') {
      answers[field.key] = false;
    }
  }
  return answers;
}

function visible(field: FormField, answers: Answers): boolean {
  if (field.type === 'external') return true;
  if (field.hidden) return false;
  if (!field.when?.length) return true;
  return field.when.every((condition) => {
    const value = answers[condition.key];
    const matched = Array.isArray(value)
      ? value.includes(String(condition.value))
      : value === condition.value;
    return condition.op === 'eq' ? matched : !matched;
  });
}

function empty(value: FormValue | undefined): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * 模型提问时显示在输入框上方的快捷回答：选项可以直接点，也能输入自定义答案。
 * 只有一个单选项时，点选项就提交；多字段时先填完再点提交。
 */
export default function QuestionPrompt({
  form,
  count,
  pending,
  onReply,
  onCancel,
}: {
  form?: FormInfo;
  count: number;
  pending: boolean;
  onReply: (answer: FormAnswer) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!form) return;
    setAnswers(initialAnswers(form));
    setCustom({});
    setErrors({});
  }, [form?.id]);

  function set(key: string, value: FormValue | undefined) {
    setAnswers((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function submit(overrides: Answers = answers) {
    if (!form) return;
    const answer: FormAnswer = {};
    const nextErrors: Record<string, string> = {};

    for (const field of form.fields) {
      if (!visible(field, overrides) || field.type === 'external') continue;
      let value = overrides[field.key];

      if (field.type === 'multiselect') {
        const list = Array.isArray(value) ? [...value] : [];
        const extra = custom[field.key]?.trim();
        if (extra) list.push(extra);
        value = list;
      }

      if (field.required && field.type !== 'boolean' && empty(value)) {
        nextErrors[field.key] = '请填写此项';
        continue;
      }
      if (empty(value)) continue;

      if (field.type === 'multiselect') {
        const list = value as string[];
        if (field.minItems !== undefined && list.length < field.minItems) {
          nextErrors[field.key] = `至少选择 ${field.minItems} 项`;
          continue;
        }
        if (field.maxItems !== undefined && list.length > field.maxItems) {
          nextErrors[field.key] = `最多选择 ${field.maxItems} 项`;
          continue;
        }
        answer[field.key] = list;
      } else {
        answer[field.key] = value as FormValue;
      }
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    onReply(answer);
  }

  function choose(field: FormField, value: FormValue) {
    const next = { ...answers, [field.key]: value };
    set(field.key, value);

    // 只有一个字段时，点选就是一个完整回答。
    const shown = form?.fields.filter((item) => visible(item, next)) ?? [];
    if (shown.length === 1 && shown[0].key === field.key) {
      submit(next);
    }
  }

  function control(field: FormField) {
    const value = answers[field.key];

    if (field.type === 'external') {
      return (
        <Link href={field.url} target="_blank" rel="noreferrer">
          {field.title ?? field.url}
        </Link>
      );
    }

    if (field.type === 'string' && field.options?.length) {
      const optionValues = field.options.map((option) => option.value);
      const typed = typeof value === 'string' && !optionValues.includes(value) ? value : '';

      return (
        <Flex direction="column" gap="2">
          <Flex wrap="wrap" gap="2">
            {field.options.map((option) => (
              <Button
                key={option.value}
                variant={value === option.value ? 'solid' : 'soft'}
                color={value === option.value ? 'blue' : 'gray'}
                size="2"
                style={{ height: 'auto', paddingBlock: 6, whiteSpace: 'normal', textAlign: 'left' }}
                onClick={() => choose(field, option.value)}
              >
                {option.label}
              </Button>
            ))}
          </Flex>
          {field.custom && (
            <TextField.Root
              value={typed}
              placeholder="或输入其他答案"
              onChange={(event) => set(field.key, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          )}
        </Flex>
      );
    }

    if (field.type === 'string') {
      return (
        <TextField.Root
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder ?? '输入答案'}
          onChange={(event) => set(field.key, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
      );
    }

    if (field.type === 'multiselect') {
      const list = Array.isArray(value) ? value : [];
      const toggle = (option: string) => {
        set(
          field.key,
          list.includes(option) ? list.filter((item) => item !== option) : [...list, option]
        );
      };
      return (
        <Flex direction="column" gap="2">
          <Flex wrap="wrap" gap="2">
            {field.options.map((option) => (
              <Button
                key={option.value}
                variant={list.includes(option.value) ? 'solid' : 'soft'}
                color={list.includes(option.value) ? 'blue' : 'gray'}
                size="2"
                style={{ height: 'auto', paddingBlock: 6, whiteSpace: 'normal', textAlign: 'left' }}
                onClick={() => toggle(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </Flex>
          {field.custom && (
            <TextField.Root
              value={custom[field.key] ?? ''}
              placeholder="其他（回车提交）"
              onChange={(event) =>
                setCustom((current) => ({ ...current, [field.key]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
            />
          )}
        </Flex>
      );
    }

    if (field.type === 'boolean') {
      return (
        <Flex gap="2">
          <Button
            variant={value === true ? 'solid' : 'soft'}
            color={value === true ? 'blue' : 'gray'}
            size="2"
            onClick={() => choose(field, true)}
          >
            是
          </Button>
          <Button
            variant={value === false ? 'solid' : 'soft'}
            color={value === false ? 'blue' : 'gray'}
            size="2"
            onClick={() => choose(field, false)}
          >
            否
          </Button>
        </Flex>
      );
    }

    return (
      <TextField.Root
        type="number"
        value={typeof value === 'number' ? String(value) : ''}
        min={typeof field.minimum === 'number' ? field.minimum : undefined}
        max={typeof field.maximum === 'number' ? field.maximum : undefined}
        step={field.type === 'integer' ? 1 : 'any'}
        onChange={(event) => {
          const next = event.target.value === '' ? undefined : Number(event.target.value);
          set(field.key, next !== undefined && Number.isNaN(next) ? undefined : next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
    );
  }

  return (
    <Flex
      direction="column"
      gap="3"
      className="rounded-[10px] border border-(--line) bg-(--panel) px-4 py-3.5"
    >
      <Flex align="center" gap="2">
        <Text size="3" weight="bold">
          {form?.title ?? '需要你的回答'}
        </Text>
        {count > 1 && <Badge color="blue">{count} 个待回答</Badge>}
      </Flex>

      <Flex direction="column" gap="3">
        {form?.fields
          .filter((field) => visible(field, answers))
          .map((field) => (
            <Flex key={field.key} direction="column" gap="2">
              <Flex align="baseline" gap="1">
                <Text size="2" color="gray">
                  {field.title ?? field.key}
                </Text>
                {field.type !== 'external' && field.required && (
                  <Text size="2" color="red">
                    *
                  </Text>
                )}
              </Flex>
              {field.description && (
                <Text size="2" color="gray">
                  {field.description}
                </Text>
              )}
              {control(field)}
              {errors[field.key] && (
                <Text size="1" color="red">
                  {errors[field.key]}
                </Text>
              )}
            </Flex>
          ))}
      </Flex>

      <Flex justify="end" gap="2">
        <Button variant="soft" color="gray" size="2" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button size="2" onClick={() => submit()} loading={pending}>
          提交
        </Button>
      </Flex>
    </Flex>
  );
}
