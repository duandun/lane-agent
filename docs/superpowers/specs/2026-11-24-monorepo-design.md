# lane-agent Monorepo 重构设计

日期：2026-11-24
分支：`refactor/monorepo`（从 `feat/mobile` 切出）

## 目标

把 lane-agent（Electron 桌面端）和 lane-serve（Express + 手机 Web）合并成一个 bun workspaces monorepo，统一安装、构建和目录边界，并把桌面端与手机端重复的手机同步协议收敛到一个共享包。

## 非目标

- 不共享 UI：桌面端用 antd + @ant-design/x，手机端用 Radix UI + TanStack Start，保持各自依赖。
- 不把 `apps/server` 改成 TypeScript。
- 不改变线上部署路径：nginx root 仍是 `/opt/lane-serve/web/dist/client`，server 仍部署到 `/opt/lane-serve/server`、端口 6060。
- 不保留 lane-serve 的 git 历史（用户确认直接拷贝代码）。
- 不引入 Turborepo/Nx 等额外构建工具。

## 目标结构

```
lane-agent/
  apps/
    desktop/     Electron 主进程 + preload + 打包脚本（原 src/app、scripts/bundle-*.mjs、resources/、assets/agent-desktop-skill）
    web/         桌面端渲染界面（原 src/web + src/core + src/assets + vite.config.ts + tsconfig.json）
    mobile/      手机 Web（原 lane-serve/web 全部：TanStack Start SPA）
    server/      API + Socket.IO（原 lane-serve/server 全部）
  packages/
    protocol/    手机同步协议：事件名、消息类型、限额（新增，纯 ESM JS + d.ts）
  package.json   workspaces + 根脚本
  bun.lock       唯一的安装锁文件
  assets/        删除（内容按归属拆进 apps/desktop、apps/web）
  resources/     删除（opencode CLI 下载到 apps/desktop/resources/）
  scripts/       删除（移进 apps/desktop/scripts/）
  CLAUDE.md、README.md   留在根目录，只更新其中的路径和命令
  docs/superpowers/specs/ 设计文档
```

### apps/desktop

- 代码：`src/`（原 `src/app`）、`tsconfig.json`（原 `tsconfig.electron.json`，outDir 仍为 `dist-electron`）。
- 渲染产物：构建时把 `apps/web/dist` 拷贝到 `apps/desktop/dist`。`main.ts` 里 `new URL('../dist', import.meta.url)` 不变。
- 自带资源：`assets/icon.png`（electron-builder 的 buildResources 图标）、`assets/agent-desktop-skill/`、`resources/opencode-cli/`（脚本下载目标，gitignore）、`.npm-bundle/`（脚本生成，gitignore）、`scripts/bundle-runtime.mjs`、`scripts/bundle-opencode-cli.mjs`。
- `package.json`：`main: dist-electron/main.js`；承载现有 electron-builder `build` 配置（output 改到 `apps/desktop/release`，`extraResources` 路径相对 apps/desktop）；scripts 提供 `build`（tsc）、`build:renderer`（构建 apps/web 并拷 dist）、`dev`、`start`、`package`、`package:linux`、`package:win`。
- `dev` 脚本要先在 apps/web 起 Vite（5173），再 `electron . --dev`；退出时一并结束 Vite。
- `bundle-runtime.mjs` 里写死的 `node_modules/npm`、`node_modules/agent-desktop`，以及 `src/skill.ts` 开发态的 `node_modules/agent-desktop`，改为按模块解析结果定位（monorepo 依赖提升到根 node_modules）。
- `service.ts` 的 dev 路径 `join(app.getAppPath(), 'resources', 'opencode-cli', ...)` 不变，因为 electron 的 app 目录就是 apps/desktop。

### apps/web

- 代码：原 `src/web/`（入口、index.html）和 `src/core/` 原样保留目录，`@core`、`@web`、`@assets` 别名不变（指向 `apps/web/src/...`）。
- `vite.config.ts`：`root: src/web`，`outDir: '../../dist'`（与现在相同，实际输出 apps/web/dist）。
- `tsconfig.json`：原渲染进程 tsconfig 原样移入。
- 别名删掉已无引用的 `@`、`@app`，保留 `@core`、`@web`、`@assets`。
- 依赖：antd、@ant-design/x、tailwind、react、@opencode/client、zustand 等归 apps/web；`@opencode/client` 在 apps/desktop 也声明一份（主进程用 `service` 子路径）。

### apps/mobile

- 原 `lane-serve/web` 全量拷入（src、public、vite.config.ts、tsconfig.json、tsr.config.json、upload.sh、routeTree.gen.ts）。
- 保持 TanStack Start SPA 构建（`dist/client/_shell.html`），端口 3000、`/api` 与 `/socket.io` 代理到 6060 不变。
- `upload.sh`：仍是“上传源码 + dist 到 `/opt/lane-serve/web`”，路径逻辑不变。
- 依赖：@radix-ui/*、tanstack start/router、react、socket.io-client。

### apps/server

- 原 `lane-serve/server` 全量拷入（src/server.js、upload.sh、package.json、package-lock.json）。
- 保留 app 级 `package-lock.json`：线上只上传该目录，`cd /opt/lane-serve/server && npm ci && pm2 restart lane-serve-api` 流程不变。
- `upload.sh` 不变。

### packages/protocol

纯 ESM，无构建步骤，只供 apps/web、apps/mobile 引用（Vite 构建时内联，不影响任何部署）：

- `index.js`：`EVENTS`（welcome / phone join / chat message / agent messages / agent sync）、`PHONE_ROLES`、`LIMITS`（同步消息上限 100、手机文本 4000、广播文本 500、连接码正则）。
- `index.d.ts`：`PhoneRole`、`PhoneMessage` 类型与上面常量的类型。
- 消费方式：workspace 依赖 `@lane/protocol`。桌面端 `core/lib/socket.ts`、`core/lib/phone.ts`，手机端 `routes/phone.tsx` 里重复的字面量和类型改为引用。
- `apps/server` 不依赖共享包：服务端要能脱离 monorepo 单独上传并 `npm ci`，且服务端校验本就不该复用客户端定义；事件名和限额在 server 内保留一份。

## 根工程

- 根 `package.json`：`private: true`，`workspaces: ["apps/*", "packages/*"]`，根脚本转发到各 app（`dev:web`、`dev:mobile`、`dev:server`、`electron:dev`、`electron:package`、`format` 等）。
- 包管理统一 bun：删除 lane-serve 的 `web/package-lock.json`（apps/mobile 不再需要服务器端安装），保留 `apps/server/package-lock.json`；根生成新的 `bun.lock`。
- 全局 `.gitignore` 沿用现有模式（dist、dist-electron、.npm-bundle、.tanstack、node_modules、release），其中带根锚点的 `resources/opencode-cli`、`.cache/opencode-cli` 改成 `apps/desktop/...` 路径。
- 根 `.prettierignore` 加上 `apps/mobile`、`apps/server`，避免根 `format` 重排拷贝进来的现有代码。
- `CLAUDE.md`、`README.md` 的目录结构和命令全部更新为新路径（文件仍在根目录）。

## 验证标准

1. 根目录 `bun install` 一次成功。
2. `npx tsc -p apps/web/tsconfig.json`、`npx tsc -p apps/desktop/tsconfig.json`、`npx tsc -p apps/mobile/tsconfig.json` 全部通过。
3. `bun run dev:web`（5173）、`bun run dev:mobile`（3000）、`bun run dev:server`（6060）分别可用；手机页能连上 server。
4. `bun run electron:dev` 能打开窗口；`bun run electron:package` 能产出安装包（至少在 macOS 上跑通）。
5. `apps/mobile/upload.sh` 打包内容包含源码和 dist；`apps/server/upload.sh` 打包内容包含 src 和 package-lock。
6. 手机同步链路端到端可用：桌面配对 → 手机扫码 → 双向消息与快照同步。

## 风险与取舍

- electron-builder 对 app 目录外路径（如跨 app 引用）支持不稳，所以 desktop 需要的图标、skill、CLI 全部收进 `apps/desktop`，不做跨目录引用。
- 依赖提升到根后，electron-builder 能否把 `@opencode/client` 正确打进安装包需要在验证阶段实测；若不能，用 `files`/`extraResources` 显式包含该依赖（不引入额外构建工具）。
- server 不共享协议包，事件名/限额在 server 与 protocol 包之间会各存一份；以 README 里的接口约定为准，改协议时两边一起改。
- 两个 lockfile（根 bun.lock + apps/server/package-lock.json）是刻意保留的：server 需要能脱离 monorepo 独立部署。
- apps/mobile 从 npm 切到 bun 安装，依赖树解析可能略有差异，安装后用构建和页面验证兜底。

## 实施顺序（交给计划）

1. 建目录骨架、根 workspaces 配置，移动 lane-agent 现有三层代码。
2. 拷入 lane-serve 的两个 app，改 upload.sh 之外不做逻辑修改。
3. 新增 packages/protocol 并替换 web/mobile 的重复定义。
4. 修脚本、tsconfig、vite、electron-builder 配置，删旧目录。
5. 更新文档，按验证标准逐项跑。
