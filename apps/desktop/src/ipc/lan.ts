import { ipcMain } from 'electron';
import { setPhoneLanCode, startPhoneLan, stopPhoneLan } from '../phoneLan.js';

export function registerLanIpc() {
  ipcMain.handle('lan:start', () => startPhoneLan());
  ipcMain.handle('lan:setCode', (_event, code: unknown) => {
    setPhoneLanCode(typeof code === 'string' ? code : null);
  });
  ipcMain.handle('lan:stop', () => stopPhoneLan());
}
