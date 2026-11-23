import { app, ipcMain } from 'electron';

export function registerHealthIpc() {
  ipcMain.handle('app:ping', () => 'pong');

  // 远程服务没有 CORS 头，主进程（Node）请求绕开浏览器限制。
  ipcMain.handle('app:serverHealth', async (_event, baseUrl: string) => {
    const res = await fetch(new URL('/health', baseUrl));
    return res.ok ? await res.json() : null;
  });

  ipcMain.handle('app:info', () => ({
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    versions: {
      electron: process.versions.electron ?? '',
      node: process.versions.node,
      chrome: process.versions.chrome ?? '',
    },
  }));
}
