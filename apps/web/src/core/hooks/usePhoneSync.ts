import { useEffect, useRef } from 'react';
import type { PhoneForm, PhoneFormValue } from '@lane/protocol';
import type { Block } from '../lib/blocks';
import { toPhoneMessages } from '../lib/phone';
import {
  isPhonePaired,
  publishAgentForm,
  publishAgentMessages,
  subscribeAgentSync,
  subscribeFormAnswers,
} from '../lib/socket';

/**
 * 把 agent 的对话快照、忙碌状态和待回答表单同步给手机：blocks/working 变化时最多每
 * 300ms 发一次，表单立即发；手机请求同步时立即发送；未配对时不发送。
 * 手机提交的答案只认当前表单，避免旧消息覆盖。
 */
export function usePhoneSync(
  blocks: Block[],
  working: boolean,
  form: PhoneForm | undefined,
  onFormAnswer: (answer: Record<string, PhoneFormValue>) => void,
  onFormCancel: () => void
) {
  const latest = useRef({ blocks, working, form });
  const actions = useRef({ onFormAnswer, onFormCancel });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    latest.current = { blocks, working, form };
  }, [blocks, working, form]);

  useEffect(() => {
    actions.current = { onFormAnswer, onFormCancel };
  });

  // 手机页面加入房间后会请求一次最新快照。
  useEffect(
    () =>
      subscribeAgentSync(() => {
        const snapshot = latest.current;
        publishAgentMessages(toPhoneMessages(snapshot.blocks), snapshot.working);
        publishAgentForm(snapshot.form ?? null);
      }),
    []
  );

  // 表单出现、切换、消失时立即同步，不等节流。
  useEffect(() => {
    publishAgentForm(form ?? null);
  }, [form?.id]);

  useEffect(
    () =>
      subscribeFormAnswers(({ formID, answer, cancel }) => {
        if (latest.current.form?.id !== formID) return;
        if (cancel) actions.current.onFormCancel();
        else if (answer) actions.current.onFormAnswer(answer);
      }),
    []
  );

  // 流式输出很频繁，用节流而不是防抖，保证手机上能持续看到进展。
  useEffect(() => {
    if (!isPhonePaired() || timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const snapshot = latest.current;
      publishAgentMessages(toPhoneMessages(snapshot.blocks), snapshot.working);
    }, 300);
  }, [blocks, working]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );
}
