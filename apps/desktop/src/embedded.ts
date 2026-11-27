import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { utilityProcess, type UtilityProcess } from 'electron';

export type EmbeddedService = {
  url: string;
  username: string;
  password: string;
};

// 编译后在 dist-electron 里与 main.js 同级。
const HOST = fileURLToPath(new URL('./embedded-host.js', import.meta.url));

let child: UtilityProcess | null = null;
let service: EmbeddedService | null = null;
let starting: Promise<EmbeddedService> | null = null;

/**
 * PoC：用 Electron utilityProcess 跑 @opencode/server，仍然监听 localhost HTTP，
 * 渲染进程继续用 @opencode/client + SSE。主进程只做 Promise 编排，不接触 Effect。
 */
export async function startEmbeddedService(
  dataDir: string,
  cors: string[] = ['http://localhost:5173'],
  password = randomBytes(32).toString('base64url')
): Promise<EmbeddedService> {
  if (service) return service;
  if (starting) return starting;

  starting = (async () => {
    const proc = utilityProcess.fork(HOST, [], { stdio: 'pipe' });
    child = proc;
    proc.stdout?.on('data', (chunk) => console.log('[embedded]', String(chunk).trim()));
    proc.stderr?.on('data', (chunk) => console.error('[embedded]', String(chunk).trim()));
    proc.on('exit', () => {
      if (child === proc) {
        child = null;
        service = null;
      }
    });

    return new Promise<EmbeddedService>((resolve, reject) => {
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error('内嵌 opencode 服务启动超时'));
      }, 30_000);
      const settle = () => clearTimeout(timer);

      proc.on('message', (message: { type?: string; url?: string; message?: string }) => {
        if (message?.type === 'ready' && message.url) {
          settle();
          resolve({ url: message.url, username: 'opencode', password });
          return;
        }
        if (message?.type === 'error') {
          settle();
          proc.kill();
          reject(new Error(message.message ?? '内嵌 opencode 服务启动失败'));
        }
      });
      proc.once('exit', (code) => {
        settle();
        reject(new Error(`内嵌 opencode 服务启动失败（code ${code}）`));
      });

      proc.postMessage({ type: 'start', dataDir, cors, password });
    });
  })().then((value) => {
    service = value;
    return value;
  });

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export async function stopEmbeddedService(): Promise<void> {
  const proc = child;
  child = null;
  service = null;
  if (!proc) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      proc.kill();
      resolve();
    }, 3000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    proc.postMessage({ type: 'stop' });
  });
}
