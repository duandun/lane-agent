export type AppInfo = {
  platform: string;
  arch: string;
  appVersion: string;
  versions: { electron: string; node: string; chrome: string };
};

export type FsEntry = {
  name: string;
  /** 相对 root 的路径，统一用 / 分隔 */
  path: string;
  dir: boolean;
};

export type ExecResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

export type LocalService = {
  url: string;
  username: string;
  password: string;
};

export type AppBridge = {
  ping: () => Promise<string>;
  info: () => Promise<AppInfo>;
  localService: () => Promise<LocalService | null>;
  selectDirectory: () => Promise<string | null>;
  /** 用系统文件管理器打开路径。 */
  openPath: (path: string) => Promise<void>;
  fs: {
    list: (root: string, dir?: string) => Promise<FsEntry[]>;
    read: (root: string, path: string) => Promise<string>;
    write: (root: string, path: string, content: string) => Promise<void>;
    /** 按字节写入，用于上传的二进制附件。 */
    writeBytes: (root: string, path: string, data: Uint8Array) => Promise<void>;
  };
  exec: {
    npx: (root: string, args: string[]) => Promise<ExecResult>;
  };
};

declare global {
  interface Window {
    appBridge?: AppBridge;
  }
}

/** 浏览器里没有 preload，这里是 undefined。 */
export const appBridge = typeof window === 'undefined' ? undefined : window.appBridge;
