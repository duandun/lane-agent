import { ipcMain } from 'electron';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { resolveWithin, rootPath } from './paths.js';

export function registerFsIpc() {
  // 文件操作只发生在传入的 root 内，root 由 UI 的项目目录决定。
  ipcMain.handle('fs:list', async (_event, root: string, dir = '.') => {
    const base = await rootPath(root);
    const target = await resolveWithin(base, dir);
    const entries = await readdir(target, { withFileTypes: true });
    return entries
      .map((entry) => ({
        name: entry.name,
        path: relative(base, join(target, entry.name)).split(sep).join('/'),
        dir: entry.isDirectory(),
      }))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  });

  ipcMain.handle('fs:read', async (_event, root: string, path: string) => {
    const base = await rootPath(root);
    return readFile(await resolveWithin(base, path), 'utf8');
  });

  ipcMain.handle('fs:write', async (_event, root: string, path: string, content: string) => {
    const base = await rootPath(root);
    await writeFile(await resolveWithin(base, path), content, 'utf8');
  });

  // 上传的附件可能是二进制，单独走一条按字节写入的通道。
  ipcMain.handle('fs:writeBytes', async (_event, root: string, path: string, data: Uint8Array) => {
    const base = await rootPath(root);
    await writeFile(await resolveWithin(base, path), Buffer.from(data));
  });
}
