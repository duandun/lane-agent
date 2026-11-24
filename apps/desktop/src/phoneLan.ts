import { randomBytes } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { EVENTS, LIMITS, PHONE_CODE_RE } from '@lane/protocol';
import { Server as SocketServer } from 'socket.io';

export type PhoneLanInfo = {
  port: number;
  token: string;
  candidates: string[];
};

let http: HttpServer | null = null;
let io: SocketServer | null = null;
let info: PhoneLanInfo | null = null;
let code: string | null = null;

/** 局域网候选地址只取私网 IPv4，排除回环和虚拟网卡。 */
function candidates(port: number): string[] {
  const urls = new Set<string>();
  for (const list of Object.values(networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      const [first, second] = item.address.split('.').map(Number);
      const local =
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168);
      if (local) urls.add(`http://${item.address}:${port}`);
    }
  }
  return [...urls];
}

function codeOf(payload: unknown): string | null {
  const value = (payload as { code?: unknown } | null)?.code;
  return typeof value === 'string' ? value.trim() : null;
}

function matches(value: string | null): value is string {
  return !!code && value === code;
}

export async function startPhoneLan(): Promise<PhoneLanInfo> {
  if (info) return info;

  const token = randomBytes(16).toString('hex');
  const server = createServer((_req, res) => {
    res.writeHead(426).end('WebSocket only');
  });
  const socketServer = new SocketServer(server, { serveClient: false });

  socketServer.use((socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    if (auth?.token !== token) {
      next(new Error('unauthorized'));
      return;
    }
    next();
  });

  socketServer.on('connection', (socket) => {
    socket.on(EVENTS.phoneJoin, (payload) => {
      const value = codeOf(payload);
      if (!matches(value)) return;
      socket.join(value);
    });

    socket.on(EVENTS.agentMessages, (payload) => {
      const value = codeOf(payload);
      if (!matches(value)) return;
      const list = (payload as { messages?: unknown }).messages;
      const messages = Array.isArray(list) ? list.slice(-LIMITS.syncMessages) : [];
      socketServer
        .to(value)
        .emit(EVENTS.agentMessages, { messages, working: (payload as any)?.working === true });
    });

    socket.on(EVENTS.agentSync, (payload) => {
      const value = codeOf(payload);
      if (!matches(value)) return;
      socketServer.to(value).emit(EVENTS.agentSync, { code: value });
    });

    socket.on(EVENTS.agentForm, (payload) => {
      const value = codeOf(payload);
      if (!matches(value)) return;
      const form = (payload as { form?: unknown }).form ?? null;
      socketServer.to(value).emit(EVENTS.agentForm, { form });
    });

    socket.on(EVENTS.formAnswer, (payload) => {
      const value = codeOf(payload);
      if (!matches(value)) return;
      const data = payload as {
        formID?: unknown;
        answer?: unknown;
        cancel?: unknown;
      };
      const formID = typeof data.formID === 'string' ? data.formID : '';
      const cancel = data.cancel === true;
      if (!formID || (!cancel && (!data.answer || typeof data.answer !== 'object'))) return;
      socketServer
        .to(value)
        .emit(EVENTS.formAnswer, { formID, answer: cancel ? undefined : data.answer, cancel });
    });

    socket.on(EVENTS.chatMessage, (payload) => {
      const value = codeOf(payload);
      if (!matches(value)) return;
      const msg =
        typeof (payload as { msg?: unknown }).msg === 'string'
          ? (payload as { msg: string }).msg.trim()
          : '';
      if (!msg) return;
      socket.join(value);
      socketServer.to(value).emit(EVENTS.chatMessage, {
        id: socket.id,
        msg: msg.slice(0, LIMITS.broadcastText),
        code: value,
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  http = server;
  io = socketServer;
  info = { port, token, candidates: candidates(port) };
  return info;
}

export function setPhoneLanCode(value: string | null) {
  code = value && PHONE_CODE_RE.test(value) ? value : null;
}

export async function stopPhoneLan(): Promise<void> {
  code = null;
  info = null;
  const socketServer = io;
  const server = http;
  io = null;
  http = null;
  if (socketServer) {
    socketServer.disconnectSockets(true);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      socketServer.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (server?.listening) {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      server.close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
