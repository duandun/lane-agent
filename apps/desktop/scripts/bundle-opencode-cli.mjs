import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const VERSION = process.env.OPENCODE_CLI_VERSION ?? '2.3.0';

const TARGETS = {
  'darwin-arm64': { package: '@opencode/cli-darwin-arm64', os: 'darwin', cpu: 'arm64' },
  'darwin-x64': { package: '@opencode/cli-darwin-x64-baseline', os: 'darwin', cpu: 'x64' },
  'windows-arm64': { package: '@opencode/cli-windows-arm64', os: 'win32', cpu: 'arm64' },
  'windows-x64': { package: '@opencode/cli-windows-x64-baseline', os: 'win32', cpu: 'x64' },
  'linux-x64': { package: '@opencode/cli-linux-x64-baseline', os: 'linux', cpu: 'x64' },
  'linux-arm64': { package: '@opencode/cli-linux-arm64', os: 'linux', cpu: 'arm64' },
};

function hostTarget() {
  if (process.platform === 'darwin')
    return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  if (process.platform === 'win32')
    return process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  throw new Error(`不支持的平台：${process.platform}/${process.arch}`);
}

const target = process.env.OPENCODE_TARGET ?? hostTarget();
const entry = TARGETS[target];
if (!entry) throw new Error(`未知的 OPENCODE_TARGET：${target}`);

const binaryName = entry.os === 'win32' ? 'opencode.exe' : 'opencode';
const cacheDir = resolve('.cache/opencode-cli', target, VERSION);
const cachedBinary = join(cacheDir, binaryName);
const cachedVersion = join(cacheDir, 'version');

async function download() {
  const temporary = await mkdtemp(join(tmpdir(), 'opencode-cli-'));
  try {
    console.log(`下载 ${entry.package}@${VERSION} (${target})...`);
    execFileSync(
      'bun',
      [
        'install',
        '--no-save',
        '--cwd',
        temporary,
        `${entry.package}@${VERSION}`,
        `--os=${entry.os}`,
        `--cpu=${entry.cpu}`,
      ],
      { stdio: 'inherit' }
    );

    const pkg = join(temporary, 'node_modules', entry.package);
    const from = join(pkg, 'bin', binaryName);
    const manifest = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));

    await mkdir(cacheDir, { recursive: true });
    await cp(from, cachedBinary);
    await writeFile(cachedVersion, `${manifest.version}\n`);
    return manifest.version;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

let version;
if (existsSync(cachedBinary) && existsSync(cachedVersion)) {
  version = (await readFile(cachedVersion, 'utf8')).trim();
  console.log(`使用缓存 ${cachedBinary}`);
} else {
  version = await download();
}

const output = resolve('resources', 'opencode-cli');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const dest = join(output, binaryName);
await cp(cachedBinary, dest);
await chmod(dest, 0o755);
await writeFile(join(output, 'version'), `${version}\n`);

if (entry.os === 'darwin') {
  execFileSync('codesign', ['--force', '--sign', '-', dest], { stdio: 'inherit' });
}

console.log(`已放置 ${dest}（v${version}）`);
