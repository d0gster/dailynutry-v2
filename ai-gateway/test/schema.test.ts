import { describe, it, expect } from 'vitest';
import { DietPlanExtractionSchema } from '@/core/schema';

describe('DietPlanExtractionSchema', () => {
  const validMeal = {
    id: 'cafe',
    time: '08:00',
    name: 'Café da manhã',
    groups: [{ name: 'Carbo', category: 'carb', items: [{ name: 'Pão', rawQty: 2, unit: 'fatias' }] }],
  };

  it('accepts a well-formed plan', () => {
    const r = DietPlanExtractionSchema.safeParse({ notes: [], meals: [validMeal] });
    expect(r.success).toBe(true);
  });

  it('defaults rawQty/unit and notes when absent', () => {
    const r = DietPlanExtractionSchema.safeParse({
      meals: [{ ...validMeal, groups: [{ name: 'G', category: 'other', items: [{ name: 'X' }] }] }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.notes).toEqual([]);
      expect(r.data.meals[0].groups[0].items[0].rawQty).toBe(0);
      expect(r.data.meals[0].groups[0].items[0].unit).toBe('');
    }
  });

  it('rejects a category outside the enum', () => {
    const r = DietPlanExtractionSchema.safeParse({
      meals: [{ ...validMeal, groups: [{ name: 'G', category: 'carbohydrate', items: [{ name: 'X', rawQty: 1, unit: 'g' }] }] }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a malformed time', () => {
    const r = DietPlanExtractionSchema.safeParse({ meals: [{ ...validMeal, time: '8h' }] });
    expect(r.success).toBe(false);
  });

  it('rejects a plan with no meals', () => {
    expect(DietPlanExtractionSchema.safeParse({ meals: [] }).success).toBe(false);
  });

  it('rejects a group with no items', () => {
    const r = DietPlanExtractionSchema.safeParse({
      meals: [{ ...validMeal, groups: [{ name: 'G', category: 'carb', items: [] }] }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    const r = DietPlanExtractionSchema.safeParse({
      meals: [{ ...validMeal, groups: [{ name: 'G', category: 'carb', items: [{ name: 'X', rawQty: -5, unit: 'g' }] }] }],
    });
    expect(r.success).toBe(false);
  });
});
