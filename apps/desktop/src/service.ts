import { app } from 'electron';
import { join } from 'node:path';
import { startEmbeddedService } from './embedded.js';

export type LocalService = {
  url: string;
  username: string;
  password: string;
};

let ensured: Promise<LocalService | null> | null = null;

function corsOrigins(): string[] {
  const origins = new Set(['http://localhost:5173']);
  const dev = process.env.ELECTRON_START_URL;
  if (dev) {
    try {
      origins.add(new URL(dev).origin);
    } catch {
      // 非法 URL 就只用默认 origin
    }
  }
  return [...origins];
}

/**
 * 用内嵌的 @opencode/server 启动本地服务（utilityProcess + localhost HTTP）。
 * 服务在本机执行 agent，skill 和 agent-desktop CLI 都在本机，不依赖远程服务器。
 */
export function ensureLocalService(): Promise<LocalService | null> {
  ensured ??= startEmbeddedService(
    join(app.getPath('userData'), 'opencode-embedded'),
    corsOrigins()
  ).catch((error) => {
    // 启动失败不缓存，下次 IPC 调用可以重试。
    ensured = null;
    console.error('本地 opencode 服务启动失败：', error);
    return null;
  });
  return ensured;
}
