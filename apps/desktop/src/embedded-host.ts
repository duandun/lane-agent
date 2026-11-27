import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeServices } from '@effect/platform-node';
import { ServerProcess } from '@opencode/server/process';
import { Global } from '@opencode/util/global';
import { AppProcess } from '@opencode/util/process';
import { LayerNode } from '@opencode/util/effect/layer-node';
import { Effect, Fiber } from 'effect';
import { HttpServer } from 'effect/http';

type StartMessage = {
  type: 'start';
  dataDir: string;
  cors: string[];
  password: string;
};

type StopMessage = { type: 'stop' };

type ParentPort = {
  on: (event: 'message', listener: (event: { data: unknown }) => void) => void;
  postMessage: (message: unknown) => void;
};

// Electron utility process 的父进程消息端口。
const parent = (process as unknown as { parentPort: ParentPort }).parentPort;
let fiber: ReturnType<typeof Effect.runFork> | null = null;

async function start(message: StartMessage): Promise<void> {
  if (fiber) return;
  await mkdir(message.dataDir, { recursive: true });

  let resolveUrl!: (url: string) => void;
  let rejectUrl!: (error: unknown) => void;
  const ready = new Promise<string>((resolve, reject) => {
    resolveUrl = resolve;
    rejectUrl = reject;
  });

  const program = Effect.scoped(
    Effect.gen(function* () {
      const server = yield* ServerProcess.start<never, never>({
        // 免费额度网关按 User-Agent 里的 opencode 版本判断，传的必须是内嵌 server 的版本
        // （≥1.18.0），升级 @opencode/server 时这里一起改。
        app: { name: 'lane-desktop', version: '2.4.2' },
        hostname: '127.0.0.1',
        port: 0,
        password: message.password,
        cors: message.cors,
        database: { path: join(message.dataDir, 'opencode.db') },
        // 自定义模型等 app 级配置写在这个文件里（不影响项目目录），服务端会监听它热加载。
        config: { file: join(message.dataDir, 'opencode.json') },
      });
      const url = HttpServer.formatAddress(server.address);
      console.log(`embedded opencode server listening on ${url}`);
      resolveUrl(url);
      yield* server.shutdown;
    })
  ).pipe(
    Effect.provide(LayerNode.compile(LayerNode.group([Global.node, AppProcess.node]))),
    Effect.provide(NodeServices.layer),
    Effect.tapError((error) => Effect.sync(() => rejectUrl(error)))
  );

  fiber = Effect.runFork(program as Effect.Effect<void, unknown, never>);
  const url = await ready;
  parent.postMessage({ type: 'ready', url });
}

parent.on('message', (event) => {
  const data = event.data as StartMessage | StopMessage;
  if (data.type === 'start') {
    start(data).catch((error) => {
      parent.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }
  if (data.type === 'stop') {
    const current = fiber;
    fiber = null;
    if (current) {
      void Effect.runPromise(Fiber.interrupt(current)).finally(() => process.exit(0));
      return;
    }
    process.exit(0);
  }
});
