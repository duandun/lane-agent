import type { PhoneMessage } from '@lane/protocol';
import { LIMITS } from '@lane/protocol';
import type { Block } from './blocks';
import { toolFileDiff } from './diff';
import { BASE_URL, PHONE_CODE_KEY, joinPhoneRoom } from './socket';

export type PhonePairing = {
  code: string;
  url: string;
  qr: string;
};

/**
 * 同步给手机的对话快照：保留 user / assistant / system / 文件改动，
 * 跳过 reasoning 和普通工具调用（即 UI 里的 activity 组）。
 */
export function toPhoneMessages(blocks: Block[]): PhoneMessage[] {
  const messages: PhoneMessage[] = [];
  for (const block of blocks) {
    if (block.kind === 'user') {
      messages.push({ role: 'user', text: block.text });
    } else if (block.kind === 'text') {
      messages.push({ role: 'assistant', text: block.text });
    } else if (block.kind === 'notice') {
      messages.push({ role: 'system', text: block.text });
    } else if (block.kind === 'tool') {
      const diff = toolFileDiff(block.name, block.input);
      if (diff) messages.push({ role: 'change', text: `修改文件：${diff.path}` });
    }
  }
  return messages.filter((message) => message.text.trim()).slice(-LIMITS.syncMessages);
}

/**
 * Ask lane-serve for a fresh phone pairing: a six-digit code plus the
 * broadcast URL rendered as a QR data URL. The code is stored in
 * sessionStorage so socket messages can be filtered by it.
 */
export async function requestPhonePairing(): Promise<PhonePairing> {
  const response = await fetch(`${BASE_URL}/api/agent/pair`, { method: 'POST' });
  const data = (await response.json().catch(() => null)) as
    | (Partial<PhonePairing> & {
        error?: string;
      })
    | null;
  if (!response.ok || !data?.code || !data.qr) {
    throw new Error(data?.error ?? `请求失败（HTTP ${response.status}）`);
  }
  sessionStorage.setItem(PHONE_CODE_KEY, data.code);
  joinPhoneRoom(data.code);
  return { code: data.code, url: data.url ?? '', qr: data.qr };
}
