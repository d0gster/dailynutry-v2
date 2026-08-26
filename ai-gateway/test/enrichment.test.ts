import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichPlan } from '@/core/enrichment';
import type { DietPlanExtraction } from '@/core/schema';
import type { TacoFood } from '@/db/taco';
import type { YieldFactor } from '@/db/yield';

// Mock the DB modules so tests don't need a real database.
vi.mock('@/db/taco', () => ({
  searchTacoBatch: vi.fn(),
}));
vi.mock('@/db/yield', () => ({
  searchYieldBatch: vi.fn(),
}));

import { searchTacoBatch } from '@/db/taco';
import { searchYieldBatch } from '@/db/yield';

const mockedTacoBatch = vi.mocked(searchTacoBatch);
const mockedYieldBatch = vi.mocked(searchYieldBatch);

function makePlan(items: Array<{ name: string; rawQty: number; unit: string }>): DietPlanExtraction {
  return {
    notes: [],
    meals: [{
      id: 'cafe',
      time: '08:00',
      name: 'Café da manhã',
      groups: [{
        name: 'Grupo',
        category: 'protein',
        items,
      }],
    }],
  };
}

describe('enrichPlan', () => {
  beforeEach(() => {
    mockedTacoBatch.mockReset();
    mockedYieldBatch.mockReset();
    mockedTacoBatch.mockResolvedValue(new Map<string, TacoFood>());
    mockedYieldBatch.mockResolvedValue(new Map<string, YieldFactor>());
  });

  it('enriches with TACO data when match found', async () => {
    mockedTacoBatch.mockResolvedValue(new Map([['Frango grelhado', {
      taco_id: 123,
      name: 'Frango, peito, sem pele, grelhado',
      group_name: 'Carnes',
      energy_kcal: 159,
      protein_g: 32,
      carb_g: 0,
      fat_g: 3.2,
      fiber_g: 0,
      sodium_mg: 52,
    }]]));

    const plan = makePlan([{ name: 'Frango grelhado', rawQty: 150, unit: 'g' }]);
    const result = await enrichPlan(plan);
    const item = result.meals[0].groups[0].items[0];

    expect(item.tacoId).toBe(123);
    expect(item.calories).toBeCloseTo(238.5, 1);
    expect(item.protein).toBeCloseTo(48, 1);
    expect(item.carbs).toBeCloseTo(0, 1);
    expect(item.fat).toBeCloseTo(4.8, 1);
  });

  it('enriches with yield factor when match found', async () => {
    mockedYieldBatch.mockResolvedValue(new Map([['Frango peito', {
      id: 1,
      name: 'frango peito',
      category: 'protein',
      factor: 0.65,
      method: 'cozido',
      source: 'padrao',
      notes: null,
    }]]));

    const plan = makePlan([{ name: 'Frango peito', rawQty: 150, unit: 'g' }]);
    const result = await enrichPlan(plan);

    expect(result.meals[0].groups[0].items[0].yieldFactor).toBe(0.65);
  });

  it('returns plan unchanged when no matches', async () => {
    const plan = makePlan([{ name: 'Algo desconhecido', rawQty: 100, unit: 'g' }]);
    const result = await enrichPlan(plan);
    const item = result.meals[0].groups[0].items[0];

    expect(item.tacoId).toBeUndefined();
    expect(item.calories).toBeUndefined();
    expect(item.yieldFactor).toBeUndefined();
  });

  it('never throws even if the DB lookups fail', async () => {
    mockedTacoBatch.mockRejectedValue(new Error('DB connection refused'));
    mockedYieldBatch.mockRejectedValue(new Error('DB connection refused'));

    const plan = makePlan([{ name: 'Arroz', rawQty: 100, unit: 'g' }]);
    const result = await enrichPlan(plan);

    expect(result.meals[0].groups[0].items[0].name).toBe('Arroz');
  });

  it('handles NULL nutrient values from TACO', async () => {
    mockedTacoBatch.mockResolvedValue(new Map([['Algum alimento', {
      taco_id: 456,
      name: 'Algum alimento',
      group_name: 'Outros',
      energy_kcal: 100,
      protein_g: null,
      carb_g: null,
      fat_g: null,
      fiber_g: null,
      sodium_mg: null,
    }]]));

    const plan = makePlan([{ name: 'Algum alimento', rawQty: 200, unit: 'g' }]);
    const result = await enrichPlan(plan);
    const item = result.meals[0].groups[0].items[0];

    expect(item.tacoId).toBe(456);
    expect(item.calories).toBeCloseTo(200, 1);
    // NULL nutrients should not set the field
    expect(item.protein).toBeUndefined();
    expect(item.carbs).toBeUndefined();
    expect(item.fat).toBeUndefined();
  });

  it('passes the calling device through, so overrides are scoped to it', async () => {
    const plan = makePlan([{ name: 'Arroz', rawQty: 100, unit: 'g' }]);
    await enrichPlan(plan, 'device-abc');

    expect(mockedYieldBatch).toHaveBeenCalledWith(['Arroz'], 'device-abc');
  });

  it('looks each food up once no matter how often the plan repeats it', async () => {
    const plan = makePlan([
      { name: 'Arroz', rawQty: 100, unit: 'g' },
      { name: 'Feijão', rawQty: 80, unit: 'g' },
      { name: 'Arroz', rawQty: 120, unit: 'g' },
    ]);
    await enrichPlan(plan);

    // One batched call per source, not one per item.
    expect(mockedTacoBatch).toHaveBeenCalledTimes(1);
    expect(mockedYieldBatch).toHaveBeenCalledTimes(1);
  });
});
