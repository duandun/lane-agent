import { app, ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import { access, chmod, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';

const MAX_OUTPUT = 1024 * 1024;
const NPX_TIMEOUT = 5 * 60 * 1000;

/**
 * Node 能力的唯一入口：所有主进程操作都在这里注册，
 * 再通过 preload 的 contextBridge 暴露给渲染进程。
 */

function inside(base: string, target: string): boolean {
  return target === base || target.startsWith(base + sep);
}

/**
 * 把相对路径解析到 root 内：先做词法校验，再用 realpath 防住软链接逃逸。
 * 目标不存在时（写新文件）校验最近的已存在父目录。
 */
async function resolveWithin(base: string, rel: string): Promise<string> {
  const target = resolve(base, rel);
  if (!inside(base, target)) throw new Error('路径不在工作目录内');

  try {
    const real = await realpath(target);
    if (!inside(base, real)) throw new Error('路径不在工作目录内');
    return real;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = await realpath(dirname(target));
    if (!inside(base, parent)) throw new Error('路径不在工作目录内');
    return target;
  }
}

async function rootPath(root: string): Promise<string> {
  const base = await realpath(resolve(root));
  return base;
}

type ExecResult = { code: number | null; stdout: string; stderr: string };

function cap(text: string, truncated: boolean): string {
  return truncated ? `${text}\n[输出已截断]` : text;
}

/** 打包后 npm 在 resources/npm，开发时在 node_modules/npm。 */
function npxCli(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'npm', 'bin', 'npx-cli.js')
    : join(app.getAppPath(), 'node_modules', 'npm', 'bin', 'npx-cli.js');
}

let shimDir: Promise<string> | null = null;

/**
 * 包的 install/postinstall 脚本会从 PATH 找 node，用户机器可能没装 Node。
 * 放一个 node 包装脚本，用 Electron 自带的 Node 运行（ELECTRON_RUN_AS_NODE）。
 */
function nodeShimDir(): Promise<string> {
  shimDir ??= (async () => {
    const dir = join(app.getPath('temp'), 'opencode-web-node-shim');
    await mkdir(dir, { recursive: true });
    const electron = process.execPath;
    if (process.platform === 'win32') {
      await writeFile(
        join(dir, 'node.cmd'),
        `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electron}" %*\r\n`
      );
      return dir;
    }
    const file = join(dir, 'node');
    await writeFile(file, `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec "${electron}" "$@"\n`);
    await chmod(file, 0o755);
    return dir;
  })();
  return shimDir;
}

/**
 * 用包里自带的 npm/npx 执行 `npx --yes <args>`，JS 跑在 Electron 自带的 Node 上，
 * 用户机器不需要安装 Node/npm。
 */
async function runNpx(cwd: string, args: string[]): Promise<ExecResult> {
  const cli = npxCli();
  try {
    await access(cli);
  } catch {
    throw new Error(`内置 npm 缺失：${cli}`);
  }

  const shim = await nodeShimDir();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PATH: `${shim}${delimiter}${process.env.PATH ?? ''}`,
  };

  return new Promise((resolve, reject) => {
    const windows = process.platform === 'win32';
    const child = spawn(process.execPath, [cli, '--yes', ...args], {
      cwd,
      env,
      detached: !windows,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      // 杀掉整个进程组，避免 npx 拉起的子进程残留。
      if (!windows && child.pid) process.kill(-child.pid, 'SIGKILL');
      else child.kill();
    }, NPX_TIMEOUT);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString();
      else stdoutTruncated = true;
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString();
      else stderrTruncated = true;
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`npx 执行超时（${NPX_TIMEOUT / 60000} 分钟）`));
        return;
      }
      resolve({
        code,
        stdout: cap(stdout, stdoutTruncated),
        stderr: cap(stderr, stderrTruncated),
      });
    });
  });
}

export function registerIpc() {
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

  ipcMain.handle('exec:npx', async (_event, root: string, args: string[]) => {
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
      throw new Error('npx 参数不合法');
    }
    return runNpx(await rootPath(root), args);
  });

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
