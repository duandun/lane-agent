import { cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

// electron-builder 的 extraResources 会排除 from 目录根级的 node_modules。
// 把运行时依赖放进 .npm-bundle/<name>，它们的 node_modules 就成了子目录，能一起带走。
const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

await rm('.npm-bundle', { recursive: true, force: true });
await mkdir('.npm-bundle', { recursive: true });

await cp(pkgDir('npm'), '.npm-bundle/npm', { recursive: true, dereference: true });
await cp(pkgDir('agent-desktop'), '.npm-bundle/agent-desktop', {
  recursive: true,
  dereference: true,
});
