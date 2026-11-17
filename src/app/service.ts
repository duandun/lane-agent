import { app } from 'electron';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Service } from '@opencode/client/service';

export type LocalService = {
  url: string;
  username: string;
  password: string;
};

let ensured: Promise<LocalService | null> | null = null;

function cliPath(): string {
  const name = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  return app.isPackaged
    ? join(process.resourcesPath, 'opencode-cli', name)
    : join(app.getAppPath(), 'resources', 'opencode-cli', name);
}

async function cliVersion(): Promise<string | undefined> {
  const file = app.isPackaged
    ? join(process.resourcesPath, 'opencode-cli', 'version')
    : join(app.getAppPath(), 'resources', 'opencode-cli', 'version');
  try {
    return (await readFile(file, 'utf8')).trim() || undefined;
  } catch {
    return undefined;
  }
}

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
 * 用内置 CLI 启动本地 opencode 服务（`opencode serve --service`）。
 * 服务在本机执行 agent，skill 和 agent-desktop CLI 都在本机，不依赖远程服务器。
 * 开发时没有下载内置 CLI 就退回 PATH 里的 opencode。
 */
export function ensureLocalService(): Promise<LocalService | null> {
  ensured ??= (async () => {
    const bundled = cliPath();
    const command = [
      existsSync(bundled) ? bundled : 'opencode',
      'serve',
      '--service',
      ...corsOrigins().flatMap((origin) => ['--cors', origin]),
    ];
    // Service.ensure 只会在客户端侧看 file；CLI 永远注册到默认的 XDG state，传自定义 file 会一直等不到注册。
    const endpoint = await Service.ensure({ command, version: await cliVersion() });
    const auth = endpoint.auth ?? { username: 'opencode', password: '' };
    return { url: endpoint.url, username: auth.username, password: auth.password };
  })().catch((error) => {
    console.error('本地 opencode 服务启动失败：', error);
    return null;
  });
  return ensured;
}
