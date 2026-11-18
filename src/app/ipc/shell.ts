import { ipcMain, shell } from 'electron';
import { realpath } from 'node:fs/promises';

export function registerShellIpc() {
  // 用系统文件管理器打开目录；openPath 成功时返回空字符串，失败时返回错误信息。
  ipcMain.handle('shell:openPath', async (_event, path: string) => {
    const error = await shell.openPath(await realpath(path));
    if (error) throw new Error(error);
  });
}
