import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DietPlan } from '../constants/foods';

interface DietState {
  plan: DietPlan | null;
  pendingPlan: Partial<DietPlan> | null;
  eatenMealIds: string[];
  lastResetDate: string;
  autoCompleteMeals: boolean;
  hasCompletedOnboarding: boolean;
  shoppingChecked: string[];

  // Actions
  setPlan: (plan: DietPlan) => void;
  setPendingPlan: (plan: Partial<DietPlan> | null) => void;
  toggleMealEaten: (mealId: string) => void;
  markMealEaten: (mealId: string) => void;
  toggleAutoCompleteMeals: () => void;
  resetEatenMeals: () => void;
  clearPlan: () => void;
  checkDailyReset: () => void;
  completeOnboarding: () => void;
  clearAllData: () => void;
  toggleShoppingItem: (name: string) => void;
}

export const useDietStore = create<DietState>()(
  persist(
    (set) => ({
      // No seed plan: the app starts empty and is populated only by a real
      // import. No personal data ships in the source.
      plan: null,
      pendingPlan: null,
      eatenMealIds: [],
      lastResetDate: new Date().toISOString().split('T')[0],
      autoCompleteMeals: false,
      hasCompletedOnboarding: false,
      shoppingChecked: [],

      setPlan: (plan) => set({ plan, eatenMealIds: [] }),
      setPendingPlan: (plan) => set({ pendingPlan: plan }),

      toggleMealEaten: (mealId) => set((state) => {
        const isEaten = state.eatenMealIds.includes(mealId);
        return {
          eatenMealIds: isEaten 
            ? state.eatenMealIds.filter(id => id !== mealId)
            : [...state.eatenMealIds, mealId]
        };
      }),

      markMealEaten: (mealId) => set((state) => {
        if (state.eatenMealIds.includes(mealId)) return state;
        return { eatenMealIds: [...state.eatenMealIds, mealId] };
      }),

      toggleAutoCompleteMeals: () => set((state) => ({ 
        autoCompleteMeals: !state.autoCompleteMeals 
      })),

      resetEatenMeals: () => set({ eatenMealIds: [] }),
      clearPlan: () => set({ plan: null, eatenMealIds: [], shoppingChecked: [] }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      clearAllData: () => set({
        plan: null,
        pendingPlan: null,
        eatenMealIds: [],
        lastResetDate: new Date().toISOString().split('T')[0],
        autoCompleteMeals: false,
        hasCompletedOnboarding: false,
        shoppingChecked: [],
      }),

      toggleShoppingItem: (name) => set((state) => {
        const isChecked = state.shoppingChecked.includes(name);
        return {
          shoppingChecked: isChecked
            ? state.shoppingChecked.filter(n => n !== name)
            : [...state.shoppingChecked, name]
        };
      }),

      checkDailyReset: () => set((state) => {
        const today = new Date().toISOString().split('T')[0];
        if (state.lastResetDate !== today) {
          return { eatenMealIds: [], lastResetDate: today };
        }
        return state;
      }),
    }),
    {
      name: 'dailynutry-diet-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
