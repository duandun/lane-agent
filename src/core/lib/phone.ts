import { BASE_URL, PHONE_CODE_KEY } from './socket';

export type PhonePairing = {
  code: string;
  url: string;
  qr: string;
};

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
  return { code: data.code, url: data.url ?? '', qr: data.qr };
}
