import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Flex,
  Link,
  Text,
  TextField,
} from '@radix-ui/themes'
import type { PhoneForm, PhoneFormField, PhoneFormValue } from '@lane/protocol'

type Answers = Record<string, PhoneFormValue | undefined>

function initialAnswers(form: PhoneForm): Answers {
  const answers: Answers = {}
  for (const field of form.fields) {
    if (field.type === 'external') continue
    if (field.default !== undefined) {
      answers[field.key] = field.default
    } else if (field.type === 'multiselect') {
      answers[field.key] = []
    } else if (field.type === 'boolean') {
      answers[field.key] = false
    }
  }
  return answers
}

function visible(field: PhoneFormField, answers: Answers): boolean {
  if (field.type === 'external') return true
  if (field.hidden) return false
  if (!field.when?.length) return true
  return field.when.every((condition) => {
    const value = answers[condition.key]
    const matched = Array.isArray(value)
      ? value.includes(String(condition.value))
      : value === condition.value
    return condition.op === 'eq' ? matched : !matched
  })
}

function empty(value: PhoneFormValue | undefined): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

const optionStyle = { height: 'auto', whiteSpace: 'normal' as const, textAlign: 'left' as const }

/**
 * 和桌面端 QuestionPrompt 一致：模型提问时显示在输入区上方的快捷回答。
 * 只有一个可见单选项时，点选项就直接提交；多字段时填完再点提交。
 */
export default function QuestionPrompt({
  form,
  onReply,
  onCancel,
}: {
  form: PhoneForm
  onReply: (answer: Record<string, PhoneFormValue>) => void
  onCancel: () => void
}) {
  const [answers, setAnswers] = useState<Answers>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setAnswers(initialAnswers(form))
    setCustom({})
    setErrors({})
    setSubmitted(false)
  }, [form.id])

  function set(key: string, value: PhoneFormValue | undefined) {
    setAnswers((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function submit(overrides: Answers = answers) {
    const answer: Record<string, PhoneFormValue> = {}
    const nextErrors: Record<string, string> = {}

    for (const field of form.fields) {
      if (field.type === 'external' || !visible(field, overrides)) continue
      let value = overrides[field.key]

      if (field.type === 'multiselect') {
        const list = Array.isArray(value) ? [...value] : []
        const extra = custom[field.key]?.trim()
        if (extra) list.push(extra)
        value = list
      }

      // 数字输入框里先按字符串保存，提交时再转换。
      if (
        (field.type === 'number' || field.type === 'integer') &&
        typeof value === 'string' &&
        value.trim()
      ) {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || (field.type === 'integer' && !Number.isInteger(parsed))) {
          nextErrors[field.key] = '请输入有效的数字'
          continue
        }
        value = parsed
      }

      if (field.required && field.type !== 'boolean' && empty(value)) {
        nextErrors[field.key] = '请填写此项'
        continue
      }
      if (empty(value)) continue

      if (field.type === 'multiselect') {
        const list = value as string[]
        if (field.minItems !== undefined && list.length < field.minItems) {
          nextErrors[field.key] = `至少选择 ${field.minItems} 项`
          continue
        }
        if (field.maxItems !== undefined && list.length > field.maxItems) {
          nextErrors[field.key] = `最多选择 ${field.maxItems} 项`
          continue
        }
        answer[field.key] = list
      } else {
        answer[field.key] = value as PhoneFormValue
      }
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    onReply(answer)
    setSubmitted(true)
  }

  function choose(field: PhoneFormField, value: PhoneFormValue) {
    const next = { ...answers, [field.key]: value }
    set(field.key, value)

    // 只有一个可见字段时，点选就是一个完整回答。
    const shown = form.fields.filter((item) => visible(item, next))
    if (shown.length === 1 && shown[0].key === field.key) submit(next)
  }

  function control(field: PhoneFormField) {
    const value = answers[field.key]

    if (field.type === 'external') {
      return (
        <Link href={field.url} target="_blank" rel="noreferrer">
          {field.title ?? field.url}
        </Link>
      )
    }

    if (field.type === 'string' && field.options?.length) {
      const optionValues = field.options.map((option) => option.value)
      const typed = typeof value === 'string' && !optionValues.includes(value) ? value : ''

      return (
        <Flex direction="column" gap="2">
          <Flex wrap="wrap" gap="2">
            {field.options.map((option) => (
              <Button
                key={option.value}
                aria-pressed={value === option.value}
                style={optionStyle}
                variant={value === option.value ? 'solid' : 'soft'}
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
            />
          )}
        </Flex>
      )
    }

    if (field.type === 'string') {
      return (
        <TextField.Root
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder ?? '输入答案'}
          onChange={(event) => set(field.key, event.target.value)}
        />
      )
    }

    if (field.type === 'multiselect') {
      const list = Array.isArray(value) ? value : []
      const toggle = (option: string) => {
        set(
          field.key,
          list.includes(option) ? list.filter((item) => item !== option) : [...list, option]
        )
      }
      return (
        <Flex direction="column" gap="2">
          <Flex wrap="wrap" gap="2">
            {(field.options ?? []).map((option) => (
              <Button
                key={option.value}
                aria-pressed={list.includes(option.value)}
                style={optionStyle}
                variant={list.includes(option.value) ? 'solid' : 'soft'}
                onClick={() => toggle(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </Flex>
          {field.custom && (
            <TextField.Root
              value={custom[field.key] ?? ''}
              placeholder="其他答案"
              onChange={(event) =>
                setCustom((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          )}
        </Flex>
      )
    }

    if (field.type === 'boolean') {
      return (
        <Flex gap="2">
          <Button
            aria-pressed={value === true}
            style={optionStyle}
            variant={value === true ? 'solid' : 'soft'}
            onClick={() => choose(field, true)}
          >
            是
          </Button>
          <Button
            aria-pressed={value === false}
            style={optionStyle}
            variant={value === false ? 'solid' : 'soft'}
            onClick={() => choose(field, false)}
          >
            否
          </Button>
        </Flex>
      )
    }

    return (
      <TextField.Root
        type="number"
        inputMode={field.type === 'integer' ? 'numeric' : 'decimal'}
        step={field.type === 'integer' ? 1 : 'any'}
        min={typeof field.minimum === 'number' ? field.minimum : undefined}
        max={typeof field.maximum === 'number' ? field.maximum : undefined}
        value={typeof value === 'number' || typeof value === 'string' ? String(value) : ''}
        onChange={(event) => set(field.key, event.target.value)}
      />
    )
  }

  return (
    <Card size="2">
      <Flex direction="column" gap="3">
        <Text weight="bold">{form.title || '需要你的回答'}</Text>

        {form.fields
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
                <Text size="1" color="gray">
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

        <Flex align="center" justify="between" gap="2" wrap="wrap">
          <Text size="1" color="gray">
            {submitted ? '已提交，等待桌面确认' : ''}
          </Text>
          <Flex gap="2">
            <Button variant="soft" color="gray" onClick={onCancel}>
              取消
            </Button>
            <Button onClick={() => submit()}>提交</Button>
          </Flex>
        </Flex>
      </Flex>
    </Card>
  )
}
