import { access, lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ipcMain } from 'electron';
import { resolveWithin } from './paths.js';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BODY = 256 * 1024;

type SaveInput = {
  name: string;
  description: string;
  body: string;
  overwrite?: boolean;
};

type SaveResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'invalid' | 'managed' | 'exists' | 'symlink'; message?: string };

function skillsRoot(): string {
  return join(homedir(), '.config', 'opencode', 'skills');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function registerSkillsIpc() {
  ipcMain.handle('skills:info', async () => {
    const root = skillsRoot();
    const bin = join(
      root,
      'agent-desktop',
      'bin',
      process.platform === 'win32' ? 'agent-desktop.exe' : 'agent-desktop'
    );
    return { root, agentDesktopBin: (await exists(bin)) ? bin : null };
  });

  ipcMain.handle('skills:save', async (_event, input: SaveInput): Promise<SaveResult> => {
    if (
      !input ||
      typeof input.name !== 'string' ||
      typeof input.description !== 'string' ||
      typeof input.body !== 'string'
    ) {
      return { ok: false, reason: 'invalid', message: '参数不完整' };
    }

    const name = input.name.trim();
    if (!NAME_RE.test(name)) {
      return { ok: false, reason: 'invalid', message: '名称只能是 kebab-case（a-z0-9-）' };
    }
    if (Buffer.byteLength(input.body, 'utf8') > MAX_BODY) {
      return { ok: false, reason: 'invalid', message: '正文超过 256KB' };
    }
    if (name === 'agent-desktop') {
      return { ok: false, reason: 'managed', message: '不能覆盖内置的 agent-desktop skill' };
    }

    const root = skillsRoot();
    await mkdir(root, { recursive: true });
    // resolveWithin 需要 realpath 后的基址（调用方 fs.ts 也是先 rootPath）。
    const base = await realpath(root);

    // 目录本身是软链接时直接拒绝，避免借软链接改写别处。
    try {
      const stat = await lstat(join(base, name));
      if (stat.isSymbolicLink()) {
        return { ok: false, reason: 'symlink', message: '目标目录是软链接，已拒绝写入' };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const dir = await resolveWithin(base, name);
    if (await exists(join(dir, '.installed'))) {
      return { ok: false, reason: 'managed', message: '该 skill 由 Lane 管理，不能覆盖' };
    }

    const file = join(dir, 'SKILL.md');
    let existing = false;
    try {
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) {
        return { ok: false, reason: 'symlink', message: '目标文件是软链接，已拒绝写入' };
      }
      existing = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (existing && !input.overwrite) {
      return { ok: false, reason: 'exists', message: '同名 skill 已存在' };
    }

    await mkdir(dir, { recursive: true });
    const content = `---\nname: ${name}\ndescription: ${JSON.stringify(input.description)}\n---\n\n${input.body.trim()}\n`;
    await writeFile(file, content, 'utf8');
    return { ok: true, path: file };
  });
}
