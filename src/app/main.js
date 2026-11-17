import { app, BrowserWindow, dialog } from 'electron';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../../dist', import.meta.url));
const DEV_URL = process.env.ELECTRON_START_URL ?? 'http://localhost:5173';
const PORT = 5173;

const MIME = {
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
let serving = null;
function serveDist() {
  serving ??= new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = normalize(join(DIST, path === '/' ? 'index.html' : path));
        if (!file.startsWith(DIST + sep)) return res.writeHead(403).end();
        const body = await readFile(file);
        res
          .writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
          .end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.once('error', (error) => {
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(`端口 ${PORT} 被占用，请先关闭占用它的程序（例如 Vite 开发服务器）`)
          : error
      );
    });
    server.listen(PORT, 'localhost', () => resolve(PORT));
  });
  return serving;
}

async function load(win, url, retries = 100) {
  try {
    await win.loadURL(url);
  } catch (error) {
    // dev 下 Electron 可能比 Vite 先起来，轮询等它就绪。
    if (retries === 0) throw error;
    setTimeout(() => load(win, url, retries - 1), 300);
  }
}

const dev = process.argv.includes('--dev');

function fail(error) {
  dialog.showErrorBox('OpenCode Web 启动失败', String(error?.message ?? error));
  app.quit();
}

async function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800 });
  await load(win, dev ? DEV_URL : `http://localhost:${await serveDist()}/`);
}

app.whenReady().then(createWindow).catch(fail);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(fail);
});
