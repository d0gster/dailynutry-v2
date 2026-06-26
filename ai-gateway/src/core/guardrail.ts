import { ZodError } from 'zod';
import {
  DietPlanExtractionSchema,
  FOOD_CATEGORIES,
  type DietPlanExtraction,
  type FoodCategory,
} from './schema';
import { extractJsonString } from './json';
import { type LLMProvider, type LLMUsage } from './types';

export interface RepairLog {
  attempt: number;
  provider: string;
  validationError: string;
  latencyMs: number;
  usage: LLMUsage;
}

export interface GuardrailResult {
  plan: DietPlanExtraction;
  /** Repair turns that were needed (empty if it validated first try). */
  repairs: RepairLog[];
  /** Token usage accumulated across repair calls only (vision usage is separate). */
  repairUsage: LLMUsage;
}

/**
 * Light, non-inventive normalization applied BEFORE validation. We only fix
 * things that are unambiguously formatting (category casing, stray whitespace)
 * — never fabricate data. Anything genuinely wrong still fails Zod and goes to
 * the repair loop.
 */
function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const v = value as Record<string, unknown>;
  if (Array.isArray(v.meals)) {
    for (const meal of v.meals as Record<string, unknown>[]) {
      if (typeof meal?.time === 'string') meal.time = meal.time.trim();
      if (Array.isArray(meal?.groups)) {
        for (const group of meal.groups as Record<string, unknown>[]) {
          if (typeof group?.category === 'string') {
            const c = group.category.trim().toLowerCase();
            group.category = (FOOD_CATEGORIES as readonly string[]).includes(c)
              ? (c as FoodCategory)
              : 'other';
          }
        }
      }
    }
  }
  return v;
}

function formatZodError(err: ZodError): string {
  return err.issues
    .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
}

function tryValidate(rawText: string): { plan: DietPlanExtraction } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonString(rawText));
  } catch (e) {
    return { error: `JSON inválido (não parseável): ${(e as Error).message}` };
  }
  const result = DietPlanExtractionSchema.safeParse(sanitize(parsed));
  if (result.success) return { plan: result.data };
  return { error: formatZodError(result.error) };
}

/**
 * Validates raw LLM output against the Zod schema. On failure, runs up to
 * `maxAttempts` REPAIR turns: it sends the broken JSON + the validation error
 * back to the model (text-only, cheap — the images are never resent) and asks
 * it to fix the STRUCTURE. Throws if it can't be repaired in budget.
 */
export async function validateAndRepair(
  rawText: string,
  repairProvider: LLMProvider,
  maxAttempts: number,
): Promise<GuardrailResult> {
  const first = tryValidate(rawText);
  if ('plan' in first) {
    return { plan: first.plan, repairs: [], repairUsage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 } };
  }

  const repairs: RepairLog[] = [];
  const repairUsage: LLMUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  let currentJson = extractJsonString(rawText);
  let lastError = first.error;

  if (!repairProvider.repairJson) {
    throw new GuardrailError(`Output failed validation and provider "${repairProvider.name}" cannot repair`, lastError);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    const completion = await repairProvider.repairJson({
      systemPrompt: '',
      brokenJson: currentJson,
      validationError: lastError,
    });
    repairUsage.inputTokens += completion.usage.inputTokens;
    repairUsage.cachedInputTokens += completion.usage.cachedInputTokens;
    repairUsage.outputTokens += completion.usage.outputTokens;
    repairs.push({
      attempt,
      provider: repairProvider.name,
      validationError: lastError,
      latencyMs: Date.now() - start,
      usage: completion.usage,
    });

    const revalidated = tryValidate(completion.text);
    if ('plan' in revalidated) {
      return { plan: revalidated.plan, repairs, repairUsage };
    }
    currentJson = extractJsonString(completion.text);
    lastError = revalidated.error;
  }

  throw new GuardrailError(
    `Output still invalid after ${maxAttempts} repair attempt(s)`,
    lastError,
  );
}

export class GuardrailError extends Error {
  constructor(message: string, readonly validationError: string) {
    super(`${message}\n${validationError}`);
    this.name = 'GuardrailError';
  }
}
