import { app } from 'electron';
import { access, chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 内置 SKILL.md 有改动时加一，触发重新安装。 */
const SKILL_REVISION = 2;

type PlatformEntry = { binary: string; helper?: string; helperName?: string };

const PLATFORMS: Record<string, PlatformEntry> = {
  'darwin-arm64': {
    binary: 'agent-desktop-darwin-arm64',
    helper: 'agent-desktop-macos-helper-darwin-arm64',
    helperName: 'agent-desktop-macos-helper',
  },
  'darwin-x64': {
    binary: 'agent-desktop-darwin-x64',
    helper: 'agent-desktop-macos-helper-darwin-x64',
    helperName: 'agent-desktop-macos-helper',
  },
  'linux-arm64': {
    binary: 'agent-desktop-linux-arm64',
    helper: 'agent-desktop-linux-clipboard-owner-linux-arm64',
    helperName: 'agent-desktop-linux-clipboard-owner',
  },
  'linux-x64': {
    binary: 'agent-desktop-linux-x64',
    helper: 'agent-desktop-linux-clipboard-owner-linux-x64',
    helperName: 'agent-desktop-linux-clipboard-owner',
  },
  'win32-arm64': { binary: 'agent-desktop-win32-arm64.exe' },
  'win32-x64': { binary: 'agent-desktop-win32-x64.exe' },
};

function roots(): { pkg: string; skill: string } {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return {
    pkg: app.isPackaged ? join(base, 'agent-desktop') : join(base, 'node_modules', 'agent-desktop'),
    skill: app.isPackaged
      ? join(base, 'agent-desktop-skill')
      : join(base, 'assets', 'agent-desktop-skill'),
  };
}

/**
 * 把代码块/行内代码里的 agent-desktop 换成安装后的绝对路径，避免依赖 PATH。
 * 标题和正文里的名字保持原样。
 */
function rewriteCommands(content: string, bin: string): string {
  const replaceToken = (text: string) =>
    text.replace(
      /(^|[\s`"'(])agent-desktop(?=[\s`"')]|$)/gm,
      (_match, prefix: string) => `${prefix}${bin}`
    );

  return content
    .split(/(```[\s\S]*?```)/g)
    .map((chunk, index) => {
      if (index % 2 === 1) return replaceToken(chunk);
      return chunk
        .split(/(`[^`\n]*`)/g)
        .map((segment, segmentIndex) => (segmentIndex % 2 === 1 ? replaceToken(segment) : segment))
        .join('');
    })
    .join('');
}

function splitFrontmatter(content: string): { front: string; body: string } {
  const lines = content.split('\n');
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '---') continue;
    seen += 1;
    if (seen === 2) {
      return { front: lines.slice(0, i + 1).join('\n'), body: lines.slice(i + 1).join('\n') };
    }
  }
  return { front: '', body: content };
}

async function rewriteFile(file: string, bin: string): Promise<void> {
  const content = await readFile(file, 'utf8');
  const { front, body } = splitFrontmatter(content);
  const note = `> 本机安装：CLI 在 \`${bin}\`，下文命令里的 agent-desktop 已替换成这个绝对路径。`;
  const next = front
    ? `${front}\n\n${note}\n${rewriteCommands(body, bin)}`
    : `${note}\n\n${rewriteCommands(content, bin)}`;
  await writeFile(file, next);
}

/**
 * 把内置的 agent-desktop CLI 和 skill 安装到 OpenCode 的全局 skills 目录，
 * 这样用户机器不需要预装 agent-desktop，也不需要手动把 skill 放进 ~/.claude/skills。
 */
export async function installAgentDesktopSkill(): Promise<void> {
  const key = `${process.platform}-${process.arch}`;
  const entry = PLATFORMS[key];
  if (!entry) throw new Error(`agent-desktop 不支持当前平台：${key}`);

  const { pkg, skill } = roots();
  const version = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8')).version as string;
  const target = join(homedir(), '.config', 'opencode', 'skills', 'agent-desktop');
  const marker = join(target, '.installed');
  const want = `${version}-${key}-${SKILL_REVISION}`;

  try {
    if ((await readFile(marker, 'utf8')).trim() === want) return;
  } catch {
    // 还没装过或版本变了
  }

  // 已经存在但不是本应用装的（用户手放的 skill），不要覆盖。
  try {
    await access(target);
    try {
      await access(marker);
    } catch {
      console.warn('[agent-desktop] 已存在非本应用管理的 skill，跳过安装：' + target);
      return;
    }
  } catch {
    // 目录不存在，继续安装
  }

  const exe = process.platform === 'win32' ? 'agent-desktop.exe' : 'agent-desktop';
  await rm(target, { recursive: true, force: true });
  await cp(skill, target, { recursive: true });
  await mkdir(join(target, 'bin'), { recursive: true });

  await cp(join(pkg, 'bin', entry.binary), join(target, 'bin', exe));
  await chmod(join(target, 'bin', exe), 0o755);
  if (entry.helper && entry.helperName) {
    await cp(join(pkg, 'bin', entry.helper), join(target, 'bin', entry.helperName));
    await chmod(join(target, 'bin', entry.helperName), 0o755);
  }

  const bin = join(target, 'bin', exe);
  await rewriteFile(join(target, 'SKILL.md'), bin);
  try {
    const refs = join(target, 'references');
    for (const file of await readdir(refs)) {
      if (file.endsWith('.md')) await rewriteFile(join(refs, file), bin);
    }
  } catch {
    // 没有 references 不影响使用，CLI 自己也能 skills get
  }

  await writeFile(marker, `${want}\n`);
}
