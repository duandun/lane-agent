import { cp, mkdir, rm } from 'node:fs/promises';

// electron-builder 的 extraResources 会排除 from 目录根级的 node_modules。
// 把运行时依赖放进 .npm-bundle/<name>，它们的 node_modules 就成了子目录，能一起带走。
await rm('.npm-bundle', { recursive: true, force: true });
await mkdir('.npm-bundle', { recursive: true });

await cp('node_modules/npm', '.npm-bundle/npm', { recursive: true, dereference: true });
await cp('node_modules/agent-desktop', '.npm-bundle/agent-desktop', {
  recursive: true,
  dereference: true,
});
