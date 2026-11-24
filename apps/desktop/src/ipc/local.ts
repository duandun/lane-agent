import { ipcMain } from 'electron';
import { ensureLocalService } from '../service.js';

export function registerLocalServiceIpc() {
  ipcMain.handle('service:local', () => ensureLocalService());
}
