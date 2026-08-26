/**
 * DailyNutry — Settings Store (Zustand)
 *
 * Persists app-level configuration separate from diet data.
 * Keeps gateway model override and cached model list from the last
 * "Testar disponibilidade" run. No automatic fetches — the cache is
 * only updated when the user explicitly clicks "Testar".
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GatewayModel } from '../constants/gateway-client';

interface SettingsState {
  /** null = "Automático" (uses whatever GEMINI_MODEL is set on the gateway .env) */
  modelOverride: string | null;

  /** Cached model list from the last "Testar" run. Empty until first test. */
  cachedModels: GatewayModel[];
  /** Default model reported by the gateway on last test. */
  cachedDefaultModel: string;
  /** ISO timestamp of the last successful test. */
  lastTestedAt: string | null;

  // Actions
  setModelOverride: (model: string | null) => void;
  setCachedModels: (models: GatewayModel[], defaultModel: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      modelOverride: null,
      cachedModels: [],
      cachedDefaultModel: 'gemini-2.5-flash',
      lastTestedAt: null,

      setModelOverride: (model) => set({ modelOverride: model }),
      setCachedModels: (models, defaultModel) =>
        set({
          cachedModels: models,
          cachedDefaultModel: defaultModel,
          lastTestedAt: new Date().toISOString(),
        }),
    }),
    {
      name: 'dailynutry-settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
