import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { appBridge } from './bridge';
import type { Conn } from './client';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type CompanionKind = 'eagle' | 'cat';
export type SavedModel = { providerID: string; id: string };
export type CustomModel = { providerID: string; modelID: string; name: string; baseURL: string };
export type CustomAgent = { id: string; description: string; system: string; model: string };

const STORE_KEY = 'lane.store';

type AppState = {
  conn: Conn | null;
  /** 上次连接的项目目录；桌面端不持久化凭据，启动时只靠它恢复工作目录。 */
  directory: string;
  themeMode: ThemeMode;
  companion: CompanionKind;
  model: SavedModel | null;
  customModels: CustomModel[];
  customAgents: CustomAgent[];
  seededAgentDirs: string[];
};

type AppActions = {
  connect: (conn: Conn) => void;
  disconnect: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setCompanion: (kind: CompanionKind) => void;
  setModel: (model: SavedModel | null) => void;
  saveCustomModel: (model: CustomModel, previous?: CustomModel) => void;
  removeCustomModel: (model: CustomModel) => void;
  saveCustomAgent: (agent: CustomAgent, previousID?: string) => void;
  removeCustomAgent: (id: string) => void;
  markAgentSeeded: (directory: string) => void;
};

/** 全局状态：连接、主题、智能伙伴、模型偏好和自定义模型，统一持久化。 */
export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set) => ({
      conn: null,
      directory: '',
      themeMode: 'auto',
      companion: 'eagle',
      model: null,
      customModels: [],
      customAgents: [],
      seededAgentDirs: [],
      connect: (conn) => set((state) => ({ conn, directory: conn.directory || state.directory })),
      disconnect: () => set({ conn: null }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setCompanion: (companion) => set({ companion }),
      setModel: (model) => set({ model }),
      // 一个 Provider 下可以有任意多个模型；编辑时把旧条目一并替换掉。
      saveCustomModel: (model, previous) =>
        set((state) => ({
          customModels: [
            ...state.customModels.filter(
              (item) =>
                !(item.providerID === model.providerID && item.modelID === model.modelID) &&
                !(
                  previous &&
                  item.providerID === previous.providerID &&
                  item.modelID === previous.modelID
                )
            ),
            model,
          ],
        })),
      removeCustomModel: (model) =>
        set((state) => ({
          customModels: state.customModels.filter(
            (item) => !(item.providerID === model.providerID && item.modelID === model.modelID)
          ),
        })),
      saveCustomAgent: (agent, previousID) =>
        set((state) => ({
          customAgents: [
            ...state.customAgents.filter((item) => item.id !== agent.id && item.id !== previousID),
            agent,
          ],
        })),
      removeCustomAgent: (id) =>
        set((state) => ({
          customAgents: state.customAgents.filter((item) => item.id !== id),
        })),
      markAgentSeeded: (directory) =>
        set((state) => ({
          seededAgentDirs: state.seededAgentDirs.includes(directory)
            ? state.seededAgentDirs
            : [...state.seededAgentDirs, directory],
        })),
    }),
    {
      name: STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      // 只持久化数据，不写入 action。
      partialize: ({
        conn,
        directory,
        themeMode,
        companion,
        model,
        customModels,
        customAgents,
        seededAgentDirs,
      }) => ({
        // 桌面端的内嵌服务每次启动都换端口和密码，凭据不落盘；地址由主进程启动时下发。
        conn: appBridge ? null : conn,
        directory,
        themeMode,
        companion,
        model,
        customModels,
        customAgents,
        seededAgentDirs,
      }),
    }
  )
);
