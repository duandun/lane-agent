# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

OpenCode Web：连到用户自己启动的 `opencode serve` 的 Web/Electron 客户端（「方案 A」——不改 OpenCode 源码，只走它的 HTTP API + SSE）。`README.md` 有完整的产品背景、打包细节和踩坑说明，动手前值得读。

## Commands

包管理用 bun（`bun.lock`）。

```bash
bun install
bun dev                  # Vite 开发服务器，固定 5173（strictPort，被占用直接失败）
bun run build            # 构建渲染进程到 dist/
bun run build:app        # 只编译 Electron 主进程到 dist-electron/

bun run electron:dev     # 编译主进程 + Vite + Electron（热更新）
bun run electron:start   # 构建 dist + 主进程后用 Electron 打开（离线）
bun run electron:package # 打包当前平台产物到 release/
bun run electron:package:linux
bun run electron:package:win

bun run bundle:cli       # 下载内置 opencode CLI 到 resources/opencode-cli/（打包前需要）
bun run bundle:runtime   # 复制 npm / agent-desktop 到 .npm-bundle/
bun run format           # Prettier
bun run format:check
```

没有测试和 lint 脚本。类型检查用 `npx tsc -p tsconfig.json`（渲染进程）和 `npx tsc -p tsconfig.electron.json`（主进程）。`dist-electron/` 由脚本生成，不进 git。

## Architecture

三层，职责不要混：

- `src/web/` — 渲染进程入口与页面：`App`（连接态切换）、`Connect`、`Chat`。
- `src/core/` — web 与 app 共用的渲染侧代码：`components/`、`hooks/`（`useChatSession`、`useThemeMode`）、`lib/`（客户端、block 映射、主题 token）、`styles.css`。
- `src/app/` — Electron 主进程（独立 tsconfig，NodeNext，编译到 `dist-electron`）：静态服务、本地 opencode 服务、IPC、agent-desktop skill 安装。

Electron 生产环境把 `dist/` 用一个写死端口的本地 HTTP 服务（`http://localhost:5173`）提供给窗口，而不是 `file://`——opencode server 的 CORS 按 Origin 放行，固定 origin 才能一次配好。dev 下直接加载 Vite。

### 数据流

- `useChatSession` 是聊天状态的唯一来源：每次打开页面新建一个 session，订阅 `client.event.subscribe()` 的 SSE 事件，增量维护 `Block[]`。
- 一轮运行结束的可靠信号是 `session.execution.succeeded / failed / interrupted`；`session.idle` 只表示会话安静，不能单独当作跑完。结束时用 `message.list`（limit 上限 200）从服务端重建 block 列表，抵消客户端的乐观状态漂移。
- `@opencode/client/service` 只能在 Node 里用；渲染进程一律通过 `makeClient(conn)` 走 HTTP Basic Auth，用户名固定 `opencode`。

### Node 能力（IPC）

渲染进程拿不到 Node，新增能力固定走四步：

1. `src/app/ipc/<name>.ts` 里 `ipcMain.handle('xx:yy', ...)`。
2. 在 `src/app/ipc/index.ts` 的 `registerIpc()` 注册。
3. `src/app/preload.cts` 通过 `contextBridge` 暴露到 `window.appBridge`。
4. `src/core/lib/bridge.ts` 补类型。

浏览器里 `window.appBridge` 是 `undefined`，使用前必须判断。所有文件操作都要经过 `src/app/ipc/paths.ts` 的 `resolveWithin` / `rootPath`（词法校验 + realpath，防 `../` 和软链接逃逸）。

### 样式与主题

- Tailwind CSS v4（`@tailwindcss/vite`），`styles.css` 用 `@source '../'` 扫描源码。新代码优先写工具类；覆盖 antd 内置样式时用 `!`（例如 `text-xs!`）。
- 页面骨架颜色走 `styles.css` 里的 CSS 变量（`--bg`、`--panel`、`--line`、`--muted` 等），写法如 `text-(--muted)`；暗/亮主题通过 `:root[data-theme]` 切换。
- antd / antdX 组件的颜色和字体走 `src/core/lib/theme.ts` 的 token（`darkTheme` / `lightTheme`），两套主题必须同步改。
- 跨目录 import 用 `@core/*`、`@web/*`、`@app/*`；新增别名时 `vite.config.ts` 的 `resolve.alias` 和 `tsconfig.json` 的 `paths` 要一起改。

## Conventions

- 注释和 UI 文案用中文；代码由 Prettier 格式化（单引号、100 列、ES5 trailing comma）。
- 新弹窗/表单/状态用 antd，消息流、输入框、推理链用 `@ant-design/x`（`Bubble.List`、`Sender`、`ThoughtChain`）。
- 内置资源在开发/打包两种路径不同（`app.getAppPath()` vs `process.resourcesPath`），新增资源时参照 `src/app/service.ts`、`src/app/skill.ts` 的写法。

## Known limits

- 打开页面恢复当前目录最近更新的会话（`session.list` 首屏 30 个，可继续加载，排除子代理和归档会话）；运行中禁止切换。
- 会话消息只加载最近 200 条（`message.list` 的 limit 上限），更早的消息不会显示在界面上。
- 服务端 CORS 必须显式包含当前页面 origin（协议+主机+端口，无路径、无尾斜杠），多个 origin 重复传 `--cors`。
- 权限弹窗依赖 `permission.asked` 事件；服务端权限全 allow 时不会出现。
- `agent-desktop` skill 首次安装后需要重启 `opencode serve` 才会被发现。
