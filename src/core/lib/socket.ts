import { io } from 'socket.io-client';
import { appBridge } from './bridge';

const BASE_URL = 'http://59.110.25.186';

// 服务端没有放行 Origin，polling 会被浏览器 CORS 拦下；WebSocket 不受 CORS 限制。
export const socket = io(BASE_URL, { transports: ['websocket'] });

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
