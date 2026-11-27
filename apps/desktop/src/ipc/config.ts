import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ipcMain } from 'electron';
import { embeddedDataDir } from '../service.js';

const MAX_BYTES = 1024 * 1024;

// 与 embedded-host 传给服务端的 config.file 是同一个文件。
function configPath(): string {
  return join(embeddedDataDir(), 'opencode.json');
}

/**
 * app 级 opencode 配置（目前放自定义模型）：存在应用数据目录，跨项目生效，
 * 不写进用户的项目目录。服务端监听这个文件，改完自动热加载。
 */
export function registerConfigIpc() {
  ipcMain.handle('config:read', async () => {
    try {
      return await readFile(configPath(), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw error;
    }
  });

  ipcMain.handle('config:write', async (_event, content: string) => {
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_BYTES) {
      throw new Error('配置内容不合法');
    }
    // 写坏配置会让内嵌服务端加载失败，先确认是合法的 JSON 对象。
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('配置内容不合法');
    }
    await mkdir(dirname(configPath()), { recursive: true });
    await writeFile(configPath(), content, 'utf8');
  });
}
