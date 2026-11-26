# 内嵌 opencode server（方案 A）

桌面端不再打包/调用 opencode CLI，而是用 `@opencode/server` 在 Electron `utilityProcess` 里监听 `127.0.0.1` 随机端口，渲染进程继续用 `@opencode/client` + SSE。

## 结构

- `src/embedded.ts`：主进程管理器，`utilityProcess.fork` 启动 host、Promise 编排、超时和停止；不接触 Effect。
- `src/embedded-host.ts`：utility 进程入口，唯一直接使用 Effect 的文件，调用 `ServerProcess.start`。
- `src/service.ts`：`ensureLocalService` → `startEmbeddedService(userData/opencode-embedded, corsOrigins())`。
- 数据库：`app.getPath('userData')/opencode-embedded/opencode.db`。
- CORS：`http://localhost:5173` + `ELECTRON_START_URL` 的 origin。
- `@opencode/client` / `@opencode/server` 统一为 2.4.2（`effect` / `@effect/platform-node` 4.1.0）。

## 验证

```bash
cd apps/desktop && bun run check:embedded   # Electron 内启动 utility host + client 会话/消息/上下文/技能 + 停止
bun run electron:dev                        # 默认就是内嵌 server
```

已验证：server 监听随机端口、未认证 401、CORS 允许 5173 / 拒绝其他 Origin、client 2.4.2 调 session/message/context/skill、浏览器 Connect → Chat → 轨迹正常、`electron-builder` 打包成功（asar 含 `@opencode/server`，native 依赖进 unpacked）。

## 已知问题

- 2.4.2 的 server 没有 `/health`（404）；lane-agent 只用它打日志，不影响连接。
- CLI 资源已从 packaged extraResources 移除；安装包（macOS arm64 dmg）从约 302MB 降到约 194MB。
- `@opencode/client` 从 2.3.0 升到 2.4.2，聊天/轨迹/手机同步/权限/表单需要回归。
- Windows / Linux 打包和 native 依赖未实测。
- `agent-desktop` skill 仍通过 `assets/agent-desktop-skill` 安装，与内嵌 server 无关。
