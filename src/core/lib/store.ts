import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Conn } from './client';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type CompanionKind = 'eagle' | 'cat';
export type SavedModel = { providerID: string; id: string };
export type CustomModel = { providerID: string; modelID: string; name: string; baseURL: string };

const STORE_KEY = 'lane.store';

type AppState = {
  conn: Conn | null;
  themeMode: ThemeMode;
  companion: CompanionKind;
  model: SavedModel | null;
  customModels: CustomModel[];
  connect: (conn: Conn) => void;
  disconnect: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setCompanion: (kind: CompanionKind) => void;
  setModel: (model: SavedModel | null) => void;
  saveCustomModel: (model: CustomModel) => void;
};

/** 全局状态：连接、主题、智能伙伴、模型偏好和自定义模型，统一持久化。 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      conn: null,
      themeMode: 'auto',
      companion: 'eagle',
      model: null,
      customModels: [],
      connect: (conn) => set({ conn }),
      disconnect: () => set({ conn: null }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setCompanion: (companion) => set({ companion }),
      setModel: (model) => set({ model }),
      saveCustomModel: (model) =>
        set((state) => ({
          customModels: [
            ...state.customModels.filter((item) => item.providerID !== model.providerID),
            model,
          ],
        })),
    }),
    {
      name: STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      // 只持久化数据，不写入 action。
      partialize: ({ conn, themeMode, companion, model, customModels }) => ({
        conn,
        themeMode,
        companion,
        model,
        customModels,
      }),
    }
  )
);
