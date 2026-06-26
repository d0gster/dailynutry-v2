import { describe, it, expect } from 'vitest';
import { validateAndRepair, GuardrailError } from '@/core/guardrail';
import { type LLMProvider } from '@/core/types';
import { StubProvider, VALID_EXTRACTION_JSON } from './helpers/stub-provider';

// An intentionally invalid extraction: category outside the enum, missing time.
const BROKEN_JSON = JSON.stringify({
  meals: [{ id: 'm', name: 'Test', groups: [{ name: 'G', category: 'carbohydrate', items: [{ name: 'X', rawQty: 1, unit: 'g' }] }] }],
});

const anyProvider = new StubProvider('gemini', 'm');

describe('validateAndRepair', () => {
  it('passes valid output through with no repairs', async () => {
    const r = await validateAndRepair(VALID_EXTRACTION_JSON, anyProvider, 2);
    expect(r.repairs).toHaveLength(0);
    expect(r.repairUsage).toEqual({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
    expect(r.plan.meals[0].id).toBe('test-meal');
  });

  it('repairs invalid output via the provider and reports the repair', async () => {
    const provider = new StubProvider('gemini', 'm', { repairText: VALID_EXTRACTION_JSON });
    const r = await validateAndRepair(BROKEN_JSON, provider, 2);
    expect(r.repairs).toHaveLength(1);
    expect(r.plan.meals[0].groups[0].category).toBe('carb');
  });

  it('throws GuardrailError when it stays invalid after max attempts', async () => {
    const provider = new StubProvider('gemini', 'm', { repairText: BROKEN_JSON });
    await expect(validateAndRepair(BROKEN_JSON, provider, 2)).rejects.toBeInstanceOf(GuardrailError);
  });

  it('throws when the provider cannot repair and output is invalid', async () => {
    const noRepair = { name: 'gemini', model: 'm', extractStructured: async () => { throw new Error('unused'); } } as unknown as LLMProvider;
    await expect(validateAndRepair(BROKEN_JSON, noRepair, 2)).rejects.toThrow(/cannot repair/);
  });
});
