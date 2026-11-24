import { useEffect, useRef } from 'react';
import type { Block } from '../lib/blocks';
import { toPhoneMessages } from '../lib/phone';
import { isPhonePaired, publishAgentMessages, subscribeAgentSync } from '../lib/socket';

/**
 * 把 agent 的对话快照和忙碌状态同步给手机：blocks/working 变化时最多每
 * 300ms 发一次，手机请求同步时立即发送；未配对时不发送。
 */
export function usePhoneSync(blocks: Block[], working: boolean) {
  const latest = useRef({ blocks, working });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    latest.current = { blocks, working };
  }, [blocks, working]);

  // 手机页面加入房间后会请求一次最新快照。
  useEffect(
    () =>
      subscribeAgentSync(() => {
        const snapshot = latest.current;
        publishAgentMessages(toPhoneMessages(snapshot.blocks), snapshot.working);
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
