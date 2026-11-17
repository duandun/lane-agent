import { app, ipcMain } from 'electron';

export function registerHealthIpc() {
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
