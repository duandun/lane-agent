import { useEffect, useState } from 'react';
import { Button, Input, InputNumber, Tag, Typography } from 'antd';
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
        <Typography.Link href={field.url} target="_blank" rel="noreferrer">
          {field.title ?? field.url}
        </Typography.Link>
      );
    }

    if (field.type === 'string' && field.options?.length) {
      const optionValues = field.options.map((option) => option.value);
      const typed = typeof value === 'string' && !optionValues.includes(value) ? value : '';

      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => (
              <Button
                key={option.value}
                className="whitespace-normal! text-left! text-[15px]!"
                type={value === option.value ? 'primary' : 'default'}
                onClick={() => choose(field, option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {field.custom && (
            <Input
              className="text-base!"
              value={typed}
              placeholder="或输入其他答案"
              onChange={(event) => set(field.key, event.target.value)}
              onPressEnter={() => submit()}
            />
          )}
        </div>
      );
    }

    if (field.type === 'string') {
      return (
        <Input
          className="text-base!"
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder ?? '输入答案'}
          onChange={(event) => set(field.key, event.target.value)}
          onPressEnter={() => submit()}
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
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => (
              <Button
                key={option.value}
                className="whitespace-normal! text-left! text-[15px]!"
                type={list.includes(option.value) ? 'primary' : 'default'}
                onClick={() => toggle(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {field.custom && (
            <Input
              className="text-base!"
              value={custom[field.key] ?? ''}
              placeholder="其他（回车提交）"
              onChange={(event) =>
                setCustom((current) => ({ ...current, [field.key]: event.target.value }))
              }
              onPressEnter={() => submit()}
            />
          )}
        </div>
      );
    }

    if (field.type === 'boolean') {
      return (
        <div className="flex gap-2">
          <Button
            className="whitespace-normal! text-left! text-[15px]!"
            type={value === true ? 'primary' : 'default'}
            onClick={() => choose(field, true)}
          >
            是
          </Button>
          <Button
            className="whitespace-normal! text-left! text-[15px]!"
            type={value === false ? 'primary' : 'default'}
            onClick={() => choose(field, false)}
          >
            否
          </Button>
        </div>
      );
    }

    return (
      <InputNumber
        className="w-full! [&_input]:text-base!"
        value={typeof value === 'number' ? value : null}
        min={typeof field.minimum === 'number' ? field.minimum : undefined}
        max={typeof field.maximum === 'number' ? field.maximum : undefined}
        precision={field.type === 'integer' ? 0 : undefined}
        onChange={(next) => set(field.key, next === null ? undefined : next)}
        onPressEnter={() => submit()}
      />
    );
  }

  return (
    <div className="grid gap-3 rounded-[10px] border border-(--line) bg-(--panel) px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Typography.Text strong className="text-base!">
          {form?.title ?? '需要你的回答'}
        </Typography.Text>
        {count > 1 && <Tag color="blue">{count} 个待回答</Tag>}
      </div>

      <div className="grid gap-3">
        {form?.fields
          .filter((field) => visible(field, answers))
          .map((field) => (
            <div key={field.key} className="grid gap-2">
              <div className="flex items-baseline gap-1">
                <Typography.Text type="secondary" className="text-sm!">
                  {field.title ?? field.key}
                </Typography.Text>
                {field.type !== 'external' && field.required && (
                  <span className="text-(--err)">*</span>
                )}
              </div>
              {field.description && (
                <Typography.Text type="secondary" className="text-sm!">
                  {field.description}
                </Typography.Text>
              )}
              {control(field)}
              {errors[field.key] && (
                <Typography.Text type="danger" className="text-sm!">
                  {errors[field.key]}
                </Typography.Text>
              )}
            </div>
          ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button className="px-5! text-[15px]!" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button
          className="px-5! text-[15px]!"
          type="primary"
          onClick={() => submit()}
          loading={pending}
        >
          提交
        </Button>
      </div>
    </div>
  );
}
