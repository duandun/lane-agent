import { io } from 'socket.io-client';
import { appBridge } from './bridge';

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
  health()
    .then((data) => console.log('socket.io 已连接，health:', data?.status))
    .catch((error) => console.error('socket.io 已连接，但 health 检查失败：', error));
});

/**
 * 订阅手机广播：只转发携带本机连接码的消息，其余（无码、错码、旧格式）丢弃。
 * 返回取消订阅函数，供 useEffect 清理。
 */
export function subscribePhoneMessages(onMessage: (text: string) => void): () => void {
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
