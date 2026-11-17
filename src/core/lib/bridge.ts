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

export type AppBridge = {
  ping: () => Promise<string>;
  info: () => Promise<AppInfo>;
  fs: {
    list: (root: string, dir?: string) => Promise<FsEntry[]>;
    read: (root: string, path: string) => Promise<string>;
    write: (root: string, path: string, content: string) => Promise<void>;
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
