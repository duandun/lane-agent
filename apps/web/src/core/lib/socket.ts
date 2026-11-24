import { EVENTS } from '@lane/protocol';
import type { PhoneForm, PhoneFormAnswer, PhoneMessage } from '@lane/protocol';
import { io, type Socket } from 'socket.io-client';
import { appBridge } from './bridge';

export const BASE_URL = 'http://59.110.25.186';

/** sessionStorage key for the phone pairing code. */
export const PHONE_CODE_KEY = 'lane.phoneCode';

// 服务端没有放行 Origin，polling 会被浏览器 CORS 拦下；WebSocket 不受 CORS 限制。
const relay = io(BASE_URL, { transports: ['websocket'] });

// 桌面端在配对期间另起一个只监听局域网的端点，手机优先直连它。
let lan: Socket | null = null;

function sockets(): Socket[] {
  return lan ? [relay, lan] : [relay];
}

/** 本机在局域网里属于哪个连接码房间；未配对时是 no-op。 */
export function joinPhoneRoom(code: string | null = sessionStorage.getItem(PHONE_CODE_KEY)) {
  if (!code) return;
  for (const socket of sockets()) socket.emit(EVENTS.phoneJoin, { code });
}

/** 启动局域网端点并让桌面端接入；返回给手机扫码用的候选地址。浏览器里返回 null。 */
export async function startLanAgent(): Promise<{ lan: string[]; token: string } | null> {
  if (!appBridge) return null;
  try {
    const info = await appBridge.lan.start();
    lan?.disconnect();
    const socket = io(`http://127.0.0.1:${info.port}`, {
      transports: ['websocket'],
      auth: { token: info.token },
    });
    socket.on('connect', () => joinPhoneRoom());
    lan = socket;
    return { lan: info.candidates, token: info.token };
  } catch (cause) {
    console.error('局域网端点启动失败：', cause);
    return null;
  }
}

/** 配对码生成后同步给局域网端点，并让桌面端加入房间。 */
export async function setLanCode(code: string) {
  try {
    await appBridge?.lan.setCode(code);
  } catch (cause) {
    console.error('同步局域网配对码失败：', cause);
  }
  joinPhoneRoom(code);
}

export async function stopLanAgent(): Promise<void> {
  lan?.disconnect();
  lan = null;
  try {
    await appBridge?.lan.stop();
  } catch {
    // 端点已关闭时忽略。
  }
}

// 浏览器里 /health 同样被 CORS 拦，Electron 走主进程请求。
function health(): Promise<{ status?: string } | null> {
  return appBridge
    ? appBridge.serverHealth(BASE_URL)
    : fetch(`${BASE_URL}/health`).then((res) => res.json());
}

// connect 只说明握手成功，再用 /health 确认服务端可用。
relay.on('connect', () => {
  // 断线重连后重新加入当前连接码的房间。
  joinPhoneRoom();
  health()
    .then((data) => console.log('socket.io 已连接，health:', data?.status))
    .catch((error) => console.error('socket.io 已连接，但 health 检查失败：', error));
});

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
  for (const socket of sockets()) socket.on(EVENTS.chatMessage, onSocketMessage);
  return () => {
    for (const socket of sockets()) socket.off(EVENTS.chatMessage, onSocketMessage);
  };
}

/** 是否已经和手机配对。 */
export function isPhonePaired(): boolean {
  return !!sessionStorage.getItem(PHONE_CODE_KEY);
}

/** 把 agent 的对话快照和忙碌状态发给已配对的手机；未配对时 no-op。 */
export function publishAgentMessages(messages: PhoneMessage[], working: boolean) {
  const code = sessionStorage.getItem(PHONE_CODE_KEY);
  if (!code) return;
  for (const socket of sockets()) socket.emit(EVENTS.agentMessages, { code, messages, working });
}

/** 把当前待回答的表单同步给手机；null 表示问题已处理完。未配对时 no-op。 */
export function publishAgentForm(form: PhoneForm | null) {
  const code = sessionStorage.getItem(PHONE_CODE_KEY);
  if (!code) return;
  for (const socket of sockets()) socket.emit(EVENTS.agentForm, { code, form });
}

/** 订阅手机的表单回答；只接受本机连接码和当前表单。 */
export function subscribeFormAnswers(onAnswer: (answer: PhoneFormAnswer) => void): () => void {
  const handler = (payload: unknown) => {
    const expected = sessionStorage.getItem(PHONE_CODE_KEY);
    if (!expected || !payload || typeof payload !== 'object') return;
    const { formID, answer, cancel } = payload as Partial<PhoneFormAnswer>;
    if (typeof formID !== 'string' || !formID) return;
    if (!cancel && (!answer || typeof answer !== 'object' || Array.isArray(answer))) return;
    onAnswer({ formID, answer, cancel });
  };
  for (const socket of sockets()) socket.on(EVENTS.formAnswer, handler);
  return () => {
    for (const socket of sockets()) socket.off(EVENTS.formAnswer, handler);
  };
}

/** 手机请求一次快照时回调；只接受本机连接码。 */
export function subscribeAgentSync(onSync: () => void): () => void {
  const handler = (payload: unknown) => {
    const expected = sessionStorage.getItem(PHONE_CODE_KEY);
    if (!expected || !payload || typeof payload !== 'object') return;
    const { code } = payload as { code?: unknown };
    if (code === expected) onSync();
  };
  for (const socket of sockets()) socket.on(EVENTS.agentSync, handler);
  return () => {
    for (const socket of sockets()) socket.off(EVENTS.agentSync, handler);
  };
}
