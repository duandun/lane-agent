import { app } from 'electron';
import { OpenCode } from '@opencode/client';
import { startEmbeddedService, stopEmbeddedService } from '../dist-electron/embedded.js';

const dataDir = '/tmp/lane-embedded-poc';
const timeout = setTimeout(() => {
  console.error('embedded check timeout');
  app.exit(1);
}, 60_000);

app
  .whenReady()
  .then(async () => {
    const info = await startEmbeddedService(dataDir, ['http://localhost:5173'], 'poc-password');
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
