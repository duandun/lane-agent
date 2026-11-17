import { contextBridge, ipcRenderer } from 'electron';

// 渲染进程只能看到这一组受控方法，拿不到完整的 ipcRenderer 或 Node API。
contextBridge.exposeInMainWorld('appBridge', {
  ping: () => ipcRenderer.invoke('app:ping'),
  info: () => ipcRenderer.invoke('app:info'),
  fs: {
    list: (root: string, dir?: string) => ipcRenderer.invoke('fs:list', root, dir),
    read: (root: string, path: string) => ipcRenderer.invoke('fs:read', root, path),
    write: (root: string, path: string, content: string) =>
      ipcRenderer.invoke('fs:write', root, path, content),
  },
  exec: {
    npx: (root: string, args: string[]) => ipcRenderer.invoke('exec:npx', root, args),
  },
  localService: () => ipcRenderer.invoke('service:local'),
});
