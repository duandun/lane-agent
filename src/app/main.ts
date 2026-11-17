import { app, BrowserWindow, dialog } from 'electron';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpc } from './ipc/index.js';
import { ensureLocalService } from './service.js';
import { installAgentDesktopSkill } from './skill.js';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const PRELOAD = fileURLToPath(new URL('./preload.cjs', import.meta.url));
const DEV_URL = process.env.ELECTRON_START_URL ?? 'http://localhost:5173';
const PORT = 5173;

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/**
 * 打包后为什么还要本地 HTTP 服务：opencode server 只放行 --cors 里写明的 Origin，
 * 而 file:// 的 Origin 是 null，会被拒。用固定的 localhost:5173 起个静态服务绕开，
 * 端口写死是为了让 Origin 稳定，CORS 只需配一次。
 */
let serving: Promise<number> | null = null;
function serveDist(): Promise<number> {
  serving ??= new Promise<number>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
        const file = normalize(join(DIST, path === '/' ? 'index.html' : path));
        if (!file.startsWith(DIST + sep)) {
          res.writeHead(403).end();
          return;
        }
        const body = await readFile(file);
        res
          .writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
          .end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.once('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      reject(
        code === 'EADDRINUSE'
          ? new Error(`端口 ${PORT} 被占用，请先关闭占用它的程序（例如 Vite 开发服务器）`)
          : error
      );
    });
    server.listen(PORT, 'localhost', () => resolve(PORT));
  });
  return serving;
}

async function load(win: BrowserWindow, url: string, retries = 100): Promise<void> {
  try {
    await win.loadURL(url);
  } catch (error) {
    // dev 下 Electron 可能比 Vite 先起来，轮询等它就绪。
    if (retries === 0) throw error;
    setTimeout(() => void load(win, url, retries - 1), 300);
  }
}

const dev = process.argv.includes('--dev');

function fail(error: unknown) {
  dialog.showErrorBox(
    'OpenCode Web 启动失败',
    error instanceof Error ? error.message : String(error)
  );
  app.quit();
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: PRELOAD,
    },
  });
  await load(win, dev ? DEV_URL : `http://localhost:${await serveDist()}/`);
}

app
  .whenReady()
  .then(async () => {
    registerIpc();
    void ensureLocalService();
    await installAgentDesktopSkill().catch((error) => {
      console.error('agent-desktop skill 安装失败：', error);
    });
    return createWindow();
  })
  .catch(fail);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(fail);
});
