import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const DEV_URL = process.env.ELECTRON_START_URL ?? 'http://localhost:5173';

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
 * 而 file:// 的 Origin 是 null，会被拒。用和开发时相同的 localhost:5173 起个静态服务绕开。
 */
function serveDist() {
  return new Promise((resolve) => {
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
    const done = () => resolve(server.address().port);
    // 5173 被占用（比如 dev server 开着）时退回随机端口，CORS 就需要放行那个端口。
    server.once('error', () => server.listen(0, 'localhost', done));
    server.listen(5173, 'localhost', done);
  });
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

async function createWindow() {
  const win = new BrowserWindow({ width: 1280, height: 800 });
  await load(win, dev ? DEV_URL : `http://localhost:${await serveDist()}/`);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
