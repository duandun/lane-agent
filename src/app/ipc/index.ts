import { registerDialogIpc } from './dialog.js';
import { registerExecIpc } from './exec.js';
import { registerFsIpc } from './fs.js';
import { registerHealthIpc } from './health.js';
import { registerLocalServiceIpc } from './local.js';

/**
 * Node 能力的唯一入口：所有主进程操作都在这里注册，
 * 再通过 preload 的 contextBridge 暴露给渲染进程。
 */
export function registerIpc() {
  registerHealthIpc();
  registerFsIpc();
  registerExecIpc();
  registerLocalServiceIpc();
  registerDialogIpc();
}
