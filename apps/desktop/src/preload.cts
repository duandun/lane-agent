import { contextBridge, ipcRenderer } from 'electron';

// 渲染进程只能看到这一组受控方法，拿不到完整的 ipcRenderer 或 Node API。
contextBridge.exposeInMainWorld('appBridge', {
  ping: () => ipcRenderer.invoke('app:ping'),
  info: () => ipcRenderer.invoke('app:info'),
  serverHealth: (baseUrl: string) => ipcRenderer.invoke('app:serverHealth', baseUrl),
  fs: {
    list: (root: string, dir?: string) => ipcRenderer.invoke('fs:list', root, dir),
    read: (root: string, path: string) => ipcRenderer.invoke('fs:read', root, path),
    write: (root: string, path: string, content: string) =>
      ipcRenderer.invoke('fs:write', root, path, content),
    writeBytes: (root: string, path: string, data: Uint8Array) =>
      ipcRenderer.invoke('fs:writeBytes', root, path, data),
  },
  exec: {
    npx: (root: string, args: string[]) => ipcRenderer.invoke('exec:npx', root, args),
  },
  localService: () => ipcRenderer.invoke('service:local'),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  skills: {
    info: () => ipcRenderer.invoke('skills:info'),
    save: (input: { name: string; description: string; body: string; overwrite?: boolean }) =>
      ipcRenderer.invoke('skills:save', input),
  },
  lan: {
    start: () => ipcRenderer.invoke('lan:start'),
    setCode: (code: string | null) => ipcRenderer.invoke('lan:setCode', code),
    stop: () => ipcRenderer.invoke('lan:stop'),
  },
});
