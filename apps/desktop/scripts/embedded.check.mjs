import { mkdirSync } from 'node:fs';
import { app } from 'electron';
import { OpenCode } from '@opencode/client';
import { stopEmbeddedService } from '../dist-electron/embedded.js';
import { ensureLocalService } from '../dist-electron/service.js';

const dataDir = '/tmp/lane-embedded-poc';
const userData = '/tmp/lane-embedded-check';
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
const timeout = setTimeout(() => {
  console.error('embedded check timeout');
  app.exit(1);
}, 60_000);

app
  .whenReady()
  .then(async () => {
    const info = await ensureLocalService();
    if (!info) throw new Error('本地服务启动失败');
    console.log('url', info.url);

    const token = Buffer.from(`opencode:${info.password}`).toString('base64');
    const client = OpenCode.make({
      baseUrl: info.url,
      headers: { authorization: `Basic ${token}` },
    });

    const session = await client.session.create({ location: { directory: dataDir } });
    console.log('client session', session.id);
    const messages = await client.message.list({ sessionID: session.id, limit: 10 });
    console.log('client messages', messages.data.length);
    const context = await client.session.context({ sessionID: session.id });
    console.log('client context', context.length);
    const skills = await client.skill.list({ location: { directory: dataDir } });
    console.log('client skills', skills.data.length);

    // 健康进程要复用，不能每次 IPC 都起新进程。
    const reused = await ensureLocalService();
    if (reused?.url !== info.url) throw new Error('健康服务不应重启');

    // 进程退出后必须能重新拉起，否则崩溃后 service:local 会一直返回死地址。
    await stopEmbeddedService();
    const restarted = await ensureLocalService();
    if (!restarted) throw new Error('进程退出后无法重启');
    console.log('restart url', restarted.url);

    await stopEmbeddedService();
    clearTimeout(timeout);
    console.log('embedded check: ok');
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  });
