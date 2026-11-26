# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

bun workspaces monorepo：

- `apps/desktop` — Electron 桌面壳（主进程、preload、打包脚本和内置资源）
- `apps/web` — 桌面端渲染界面（Vite + React，也可直接当浏览器版）
- `apps/mobile` — 手机 Web（TanStack Start SPA，扫码后使用）
- `apps/server` — 手机连接用的 Express + Socket.IO 中继服务（6060）
- `apps/welcome` — 产品官网（TanStack Start SSR + Nitro，部署 Vercel，单独有 `apps/welcome/CLAUDE.md`）
- `packages/protocol` — web 与 mobile 共享的手机同步协议（server 刻意不依赖）

桌面端是「方案 A」：不改 OpenCode 源码，只连用户自己起的 `opencode serve` 的 HTTP API + SSE。`README.md` 有完整产品背景、打包细节和踩坑说明。

## Commands

包管理用 bun（根 `bun.lock`）。所有命令在根目录执行。

```bash
bun install
bun dev                  # apps/web，Vite 固定 5173（strictPort，被占用直接失败）
bun run build            # 构建渲染进程到 apps/web/dist/
bun run build:app        # 只编译 Electron 主进程到 apps/desktop/dist-electron/
bun run dev:server       # apps/server，6060
bun run dev:mobile       # apps/mobile，3000
bun run dev:welcome      # apps/welcome，3001（官网）

bun run electron:dev     # 编译主进程 + apps/web Vite + Electron（热更新）
bun run electron:start   # 构建 dist + 主进程后用 Electron 打开（离线）
bun run electron:package # 打包当前平台产物到 apps/desktop/release/
bun run electron:package:linux
bun run electron:package:win

bun run bundle:cli       # 下载内置 opencode CLI 到 apps/desktop/resources/opencode-cli/
bun run bundle:runtime   # 复制 npm / agent-desktop 到 apps/desktop/.npm-bundle/
bun run format           # Prettier（apps/mobile、apps/server 在 .prettierignore 里）
bun run format:check
```

没有测试和 lint 脚本。类型检查：

```bash
npx tsc -p apps/web/tsconfig.json
npx tsc -p apps/desktop/tsconfig.json
npx tsc --noEmit -p apps/mobile/tsconfig.json
```

`apps/*/dist`、`dist-electron/`、`.npm-bundle/` 由脚本生成，不进 git。

## Architecture

- `apps/web/src/web/` — 渲染进程入口与页面：`App`（连接态切换）、`Connect`、`Chat`。
- `apps/web/src/core/` — 渲染侧共用代码：`components/`、`hooks/`（`useChatSession`、`useThemeMode`、`usePhoneSync`）、`lib/`（客户端、block 映射、主题 token、电话同步）、`styles.css`。
- `apps/desktop/src/` — Electron 主进程（独立 tsconfig，NodeNext，`rootDir: src`，编译到 `dist-electron`）：静态服务、本地 opencode 服务、IPC、agent-desktop skill 安装。
- `apps/mobile/` — 原 lane-serve/web 全量拷入；`src/routes/{index,phone}.tsx` 是监控页和手机页，`vite.config.ts` 把 `/api`、`/socket.io` 代理到 6060。
- `apps/server/src/server.js` — Express 5 + Socket.IO；事件名与限额在这里保留一份，不引 `@lane/protocol`（部署时要能脱离 monorepo 独立 `npm ci`）。

Electron 生产环境把 `apps/desktop/dist/`（构建时从 `apps/web/dist` 拷入）用写死端口的本地 HTTP 服务（`http://localhost:5173`）提供给窗口，而不是 `file://`——opencode server 的 CORS 按 Origin 放行，固定 origin 才能一次配好。dev 下直接加载 Vite。

### 数据流

- `useChatSession` 是聊天状态的唯一来源：每次打开页面新建一个 session，订阅 `client.event.subscribe()` 的 SSE 事件，增量维护 `Block[]`。
- 一轮运行结束的可靠信号是 `session.execution.succeeded / failed / interrupted`；`session.idle` 只表示会话安静，不能单独当作跑完。结束时用 `message.list`（limit 上限 200）从服务端重建 block 列表，抵消客户端的乐观状态漂移。
- `@opencode/client/service` 只能在 Node 里用；渲染进程一律通过 `makeClient(conn)` 走 HTTP Basic Auth，用户名固定 `opencode`。
- 手机同步：`packages/protocol` 定义事件名、`PhoneMessage` 和限额；web 端 `core/lib/socket.ts` / `phone.ts` 发送，mobile 端 `routes/phone.tsx` 接收，server 只做房间转发与校验。
- 手机直连：桌面端配对时由 `apps/desktop/src/phoneLan.ts` 起一个局域网 Socket.IO 端点（token 鉴权、只转发同一连接码），`apps/web/core/lib/socket.ts` 同时接中继和本地端点；二维码里带 `lan` 候选和 `token`，手机端先探测直连、失败或断线回退中继。浏览器版没有 `appBridge`，只走中继。
- 操作存为 skill：提取逻辑在 `apps/web/src/core/lib/skillDraft.ts`（自检 `apps/web/scripts/skill-draft.check.ts`），保存走 `apps/desktop/src/ipc/skills.ts` 的 `skills:info` / `skills:save`；只写 `~/.config/opencode/skills`，拒绝覆盖 `agent-desktop` 或带 `.installed` 的受管 skill。弹窗里的「用 AI 重写」走 `client.experimental.generate.text`（当前模型 + 对话摘要），失败时保留规则草稿。
- 对话轨迹：`blocks.ts` 给 block 带 `meta`（时间/归属消息），`useChatSession` 用 `step.*` 事件维护 `steps` 和 `revision`；`useTrajectory` 用 `message.list` cursor 维护独立分页快照，并从 `session.context` 拉当前输入上下文；`core/lib/trajectory.ts` 做纯投影；`TrajectoryView` 渲染轨迹带/虚拟账本/检查器。自检：`bun run check:blocks`、`bun run check:trajectory`。

### Node 能力（IPC）

渲染进程拿不到 Node，新增能力固定走四步：

1. `apps/desktop/src/ipc/<name>.ts` 里 `ipcMain.handle('xx:yy', ...)`。
2. 在 `apps/desktop/src/ipc/index.ts` 的 `registerIpc()` 注册。
3. `apps/desktop/src/preload.cts` 通过 `contextBridge` 暴露到 `window.appBridge`。
4. `apps/web/src/core/lib/bridge.ts` 补类型。

浏览器里 `window.appBridge` 是 `undefined`，使用前必须判断。所有文件操作都要经过 `apps/desktop/src/ipc/paths.ts` 的 `resolveWithin` / `rootPath`（词法校验 + realpath，防 `../` 和软链接逃逸）。

### 样式与主题

- Tailwind CSS v4（`@tailwindcss/vite`），`apps/web/src/core/styles.css` 用 `@source '../'` 扫描源码。新代码优先写工具类；覆盖 antd 内置样式时用 `!`（例如 `text-xs!`）。
- 页面骨架颜色走 CSS 变量（`--bg`、`--panel`、`--line`、`--muted` 等），写法如 `text-(--muted)`；暗/亮主题通过 `:root[data-theme]` 切换。
- antd / antdX 组件的颜色和字体走 `apps/web/src/core/lib/theme.ts` 的 token（`darkTheme` / `lightTheme`），两套主题必须同步改。
- 跨目录 import 用 `@core/*`、`@web/*`、`@assets/*`；新增别名时 `apps/web/vite.config.ts` 的 `resolve.alias` 和 `apps/web/tsconfig.json` 的 `paths` 要一起改。
- `apps/mobile` 用 Radix UI + TanStack Start，样式在 `apps/mobile/src/styles.css`，和桌面端的 antd 体系互不共享。

## Conventions

- 注释和 UI 文案用中文；代码由 Prettier 格式化（单引号、100 列、ES5 trailing comma）。
- 新弹窗/表单/状态用 antd，消息流、输入框、推理链用 `@ant-design/x`（`Bubble.List`、`Sender`、`ThoughtChain`）。
- 内置资源在开发/打包两种路径不同（`app.getAppPath()` vs `process.resourcesPath`），新增资源时参照 `apps/desktop/src/service.ts`、`apps/desktop/src/skill.ts` 的写法。
- 改手机同步协议时，`packages/protocol` 与 `apps/server/src/server.js` 两份定义要一起改（server 不引共享包）。

## Known limits

- 打开页面恢复当前目录最近更新的会话（`session.list` 首屏 30 个，可继续加载，排除子代理和归档会话）；运行中禁止切换。
- 会话消息只加载最近 200 条（`message.list` 的 limit 上限），更早的消息不会显示在界面上。
- 对话轨迹有独立 cursor 分页，但只搜索/统计已加载页面；轨迹带固定 18×14px、按输入/模型/工具三层排列，不表达时间间隔；切回对话再进入轨迹会重新拉第一页；没有图片灯箱。
- 服务端 CORS 必须显式包含当前页面 origin（协议+主机+端口，无路径、无尾斜杠），多个 origin 重复传 `--cors`。
- 权限弹窗依赖 `permission.asked` 事件；服务端权限全 allow 时不会出现。
- `agent-desktop` skill 和新增 skill 文件会热加载（OpenCode 2.3.0 实测）：安装后只需刷新技能列表，无需重启 `opencode serve`。
- 部署脚本：`apps/mobile/upload.sh` 上传源码 + `dist` 到 `/opt/lane-serve/web`；`apps/server/upload.sh` 上传源码到 `/opt/lane-serve/server`，服务器上仍用 `npm ci` + `pm2 restart lane-serve-api`。
- Vercel 部署两个独立项目：Root Directory 分别设 `apps/welcome`（TanStack Start，Nitro）和 `apps/web`（Vite 静态站，`apps/web/vercel.json` 固定框架和 `dist` 输出）；两边构建命令都是 `bun run build`，Vercel 会在仓库根安装 workspace 依赖。`apps/web` 部署后要把域名加进 `opencode serve --cors`。
