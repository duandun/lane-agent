import { contextBridge, ipcRenderer } from 'electron';

// 渲染进程只能看到这一组受控方法，拿不到完整的 ipcRenderer 或 Node API。
contextBridge.exposeInMainWorld('appBridge', {
  ping: () => ipcRenderer.invoke('app:ping'),
  info: () => ipcRenderer.invoke('app:info'),
});
