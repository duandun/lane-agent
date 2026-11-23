import { io } from 'socket.io-client';
import { appBridge } from './bridge';
import type { PhoneMessage } from './phone';

export const BASE_URL = 'http://59.110.25.186';

/** sessionStorage key for the phone pairing code. */
export const PHONE_CODE_KEY = 'lane.phoneCode';

// 服务端没有放行 Origin，polling 会被浏览器 CORS 拦下；WebSocket 不受 CORS 限制。
const socket = io(BASE_URL, { transports: ['websocket'] });

// 浏览器里 /health 同样被 CORS 拦，Electron 走主进程请求。
function health(): Promise<{ status?: string } | null> {
  return appBridge
    ? appBridge.serverHealth(BASE_URL)
    : fetch(`${BASE_URL}/health`).then((res) => res.json());
}

// connect 只说明握手成功，再用 /health 确认服务端可用。
socket.on('connect', () => {
  // 断线重连后重新加入当前连接码的房间。
  joinPhoneRoom();
  health()
    .then((data) => console.log('socket.io 已连接，health:', data?.status))
    .catch((error) => console.error('socket.io 已连接，但 health 检查失败：', error));
});

/** 告诉服务端本机属于哪个连接码房间；未配对时是 no-op。 */
export function joinPhoneRoom(code: string | null = sessionStorage.getItem(PHONE_CODE_KEY)) {
  if (code) socket.emit('phone join', { code });
}

/**
 * 订阅手机广播：只转发携带本机连接码的消息，其余（无码、错码、旧格式）丢弃。
 * 返回取消订阅函数，供 useEffect 清理。
 */
export function subscribePhoneMessages(onMessage: (text: string) => void): () => void {
  joinPhoneRoom();
  const onSocketMessage = (payload: unknown) => {
    const expected = sessionStorage.getItem(PHONE_CODE_KEY);
    if (!expected || !payload || typeof payload !== 'object') return;
    const { msg, code } = payload as { msg?: unknown; code?: unknown };
    if (code !== expected || typeof msg !== 'string' || !msg.trim()) return;
    onMessage(msg);
  };
  socket.on('chat message', onSocketMessage);
  return () => {
    socket.off('chat message', onSocketMessage);
  };
}

/** 是否已经和手机配对。 */
export function isPhonePaired(): boolean {
  return !!sessionStorage.getItem(PHONE_CODE_KEY);
}

/** 把 agent 的对话快照和忙碌状态发给已配对的手机；未配对时 no-op。 */
export function publishAgentMessages(messages: PhoneMessage[], working: boolean) {
  const code = sessionStorage.getItem(PHONE_CODE_KEY);
  if (code) socket.emit('agent messages', { code, messages, working });
}

/** 手机请求一次快照时回调；只接受本机连接码。 */
export function subscribeAgentSync(onSync: () => void): () => void {
  const handler = (payload: unknown) => {
    const expected = sessionStorage.getItem(PHONE_CODE_KEY);
    if (!expected || !payload || typeof payload !== 'object') return;
    const { code } = payload as { code?: unknown };
    if (code === expected) onSync();
  };
  socket.on('agent sync', handler);
  return () => {
    socket.off('agent sync', handler);
  };
}
