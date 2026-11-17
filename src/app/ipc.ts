import { app, ipcMain } from 'electron';

/**
 * Node 能力的唯一入口：所有主进程操作都在这里注册，
 * 再通过 preload 的 contextBridge 暴露给渲染进程。
 */
export function registerIpc() {
  ipcMain.handle('app:ping', () => 'pong');

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
