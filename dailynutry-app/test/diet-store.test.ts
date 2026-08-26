import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The store persists through AsyncStorage, which is native-only. An in-memory
// stand-in keeps the persist middleware happy without touching a device.
vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    },
  };
});

import { useDietStore } from '@/stores/diet-store';

const initialState = useDietStore.getState();

function today(): string {
  return new Date().toISOString().split('T')[0];
}

describe('diet-store', () => {
  beforeEach(() => {
    useDietStore.setState({
      plan: null,
      pendingPlan: null,
      eatenMealIds: [],
      lastResetDate: today(),
      autoCompleteMeals: false,
      hasCompletedOnboarding: false,
      shoppingChecked: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no plan — no personal data ships in the source', () => {
    expect(initialState.plan).toBeNull();
    expect(initialState.hasCompletedOnboarding).toBe(false);
  });

  it('toggleMealEaten adds then removes the same meal', () => {
    const { toggleMealEaten } = useDietStore.getState();

    toggleMealEaten('cafe');
    expect(useDietStore.getState().eatenMealIds).toEqual(['cafe']);

    toggleMealEaten('cafe');
    expect(useDietStore.getState().eatenMealIds).toEqual([]);
  });

  it('markMealEaten is idempotent, unlike toggle', () => {
    const { markMealEaten } = useDietStore.getState();

    markMealEaten('almoco');
    markMealEaten('almoco');

    expect(useDietStore.getState().eatenMealIds).toEqual(['almoco']);
  });

  it('setPlan clears the previous day of progress', () => {
    useDietStore.setState({ eatenMealIds: ['cafe', 'almoco'] });

    useDietStore.getState().setPlan({ meals: [] } as never);

    expect(useDietStore.getState().eatenMealIds).toEqual([]);
  });

  it('checkDailyReset clears eaten meals once the date rolls over', () => {
    useDietStore.setState({ eatenMealIds: ['cafe'], lastResetDate: '2020-01-01' });

    useDietStore.getState().checkDailyReset();

    expect(useDietStore.getState().eatenMealIds).toEqual([]);
    expect(useDietStore.getState().lastResetDate).toBe(today());
  });

  it('checkDailyReset leaves today alone', () => {
    useDietStore.setState({ eatenMealIds: ['cafe'], lastResetDate: today() });

    useDietStore.getState().checkDailyReset();

    expect(useDietStore.getState().eatenMealIds).toEqual(['cafe']);
  });

  it('clearPlan drops the plan and everything derived from it', () => {
    useDietStore.setState({
      plan: { meals: [] } as never,
      eatenMealIds: ['cafe'],
      shoppingChecked: ['Arroz'],
    });

    useDietStore.getState().clearPlan();

    const state = useDietStore.getState();
    expect(state.plan).toBeNull();
    expect(state.eatenMealIds).toEqual([]);
    expect(state.shoppingChecked).toEqual([]);
  });

  it('clearAllData also forgets onboarding, unlike clearPlan', () => {
    useDietStore.setState({ hasCompletedOnboarding: true, autoCompleteMeals: true });

    useDietStore.getState().clearAllData();

    const state = useDietStore.getState();
    expect(state.hasCompletedOnboarding).toBe(false);
    expect(state.autoCompleteMeals).toBe(false);
  });

  it('toggleShoppingItem tracks items by name', () => {
    const { toggleShoppingItem } = useDietStore.getState();

    toggleShoppingItem('Arroz');
    toggleShoppingItem('Feijão');
    expect(useDietStore.getState().shoppingChecked).toEqual(['Arroz', 'Feijão']);

    toggleShoppingItem('Arroz');
    expect(useDietStore.getState().shoppingChecked).toEqual(['Feijão']);
  });
});
