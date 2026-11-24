import assert from 'node:assert/strict';
import { EVENTS } from '@lane/protocol';
import { io, type Socket } from 'socket.io-client';
import { setPhoneLanCode, startPhoneLan, stopPhoneLan } from '../src/phoneLan.ts';

function once(socket: Socket, event: string, timeout = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connected(socket: Socket, timeout = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect timeout')), timeout);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

const info = await startPhoneLan();
assert.ok(info.port > 0);
assert.equal(info.token.length, 32);
setPhoneLanCode('123456');

const url = `http://127.0.0.1:${info.port}`;
const agent = io(url, { transports: ['websocket'], auth: { token: info.token } });
const phone = io(url, { transports: ['websocket'], auth: { token: info.token } });
await Promise.all([connected(agent), connected(phone)]);

const bad = io(url, { transports: ['websocket'], auth: { token: 'wrong' } });
await assert.rejects(connected(bad), /unauthorized/);
bad.close();

agent.emit(EVENTS.phoneJoin, { code: '123456' });
phone.emit(EVENTS.phoneJoin, { code: '123456' });
// 两条连接各自入房间，等服务器处理完 join 再发消息，避免跨连接竞态。
await new Promise((resolve) => setTimeout(resolve, 200));

const snapshot = once(phone, EVENTS.agentMessages);
agent.emit(EVENTS.agentMessages, {
  code: '123456',
  messages: [{ role: 'assistant', text: 'hello' }],
  working: false,
});
assert.deepEqual(await snapshot, {
  messages: [{ role: 'assistant', text: 'hello' }],
  working: false,
});

const fromPhone = once(agent, EVENTS.chatMessage);
phone.emit(EVENTS.chatMessage, { code: '123456', msg: 'hi' });
const chat = (await fromPhone) as { msg: string; code: string };
assert.equal(chat.msg, 'hi');
assert.equal(chat.code, '123456');

const formEvent = once(phone, EVENTS.agentForm);
agent.emit(EVENTS.agentForm, {
  code: '123456',
  form: { id: 'f1', sessionID: 's', title: 't', fields: [] },
});
assert.deepEqual(((await formEvent) as { form: { id: string } }).form.id, 'f1');

const answer = once(agent, EVENTS.formAnswer);
phone.emit(EVENTS.formAnswer, { code: '123456', formID: 'f1', answer: { a: 'b' } });
assert.deepEqual(((await answer) as { formID: string }).formID, 'f1');

// 错码不转发。
let leaked = false;
phone.once(EVENTS.agentMessages, () => {
  leaked = true;
});
agent.emit(EVENTS.agentMessages, { code: '999999', messages: [], working: false });
await new Promise((resolve) => setTimeout(resolve, 300));
assert.equal(leaked, false);

agent.close();
phone.close();
await stopPhoneLan();
console.log('phone-lan check: ok');
