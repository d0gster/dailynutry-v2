import {
  type LLMProvider,
  type LLMCompletion,
  type VisionExtractParams,
  type TextRepairParams,
  type ProviderName,
  ProviderError,
} from '@/core/types';

/**
 * Test double (NOT a production mock). It implements the LLMProvider interface
 * so the router/guardrail can be exercised, but it does not fabricate domain
 * data — the caller supplies exactly the text/error to return. Lives only under
 * test/ and is never imported by production code.
 */
export class StubProvider implements LLMProvider {
  constructor(
    readonly name: ProviderName,
    readonly model: string,
    private readonly behavior: {
      /** Error to throw from extractStructured (simulates timeout/5xx/4xx). */
      throws?: ProviderError;
      /** Text to return from extractStructured when it does not throw. */
      extractText?: string;
      /** Text to return from repairJson. */
      repairText?: string;
      usage?: { inputTokens: number; cachedInputTokens: number; outputTokens: number };
    } = {},
  ) {}

  async extractStructured(_p: VisionExtractParams): Promise<LLMCompletion> {
    if (this.behavior.throws) throw this.behavior.throws;
    return this.completion(this.behavior.extractText ?? '{}');
  }

  async repairJson(_p: TextRepairParams): Promise<LLMCompletion> {
    return this.completion(this.behavior.repairText ?? '{}');
  }

  private completion(text: string): LLMCompletion {
    return {
      text,
      usage: this.behavior.usage ?? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      model: this.model,
      provider: this.name,
    };
  }
}

/** A structurally valid extraction, used as a fixture for router tests. */
export const VALID_EXTRACTION_JSON = JSON.stringify({
  notes: [],
  meals: [
    {
      id: 'test-meal',
      time: '08:00',
      name: 'Test Meal',
      groups: [{ name: 'Test Group', category: 'carb', items: [{ name: 'Test Food', rawQty: 1, unit: 'g' }] }],
    },
  ],
});
