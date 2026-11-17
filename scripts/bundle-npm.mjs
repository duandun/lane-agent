import { cp, mkdir, rm } from 'node:fs/promises';

// 打包时把内置 npm 单独放一份：electron-builder 的 extraResources 会排除
// 根级 node_modules，放进 .npm-bundle/npm/node_modules 才能一起带走。
await rm('.npm-bundle', { recursive: true, force: true });
await mkdir('.npm-bundle', { recursive: true });
await cp('node_modules/npm', '.npm-bundle/npm', { recursive: true, dereference: true });
