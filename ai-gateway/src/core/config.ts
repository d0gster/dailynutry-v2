import { type LLMProvider, type ProviderName } from './types';
import { GeminiProvider } from '@/providers/gemini';
import { OpenAIProvider } from '@/providers/openai';
import { AnthropicProvider } from '@/providers/anthropic';

const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-5.4-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Builds the ordered provider chain from the environment. A provider is
 * included only if its key is present, in PROVIDER_ORDER. The result is the
 * single source of truth for "who is primary, who are the fallbacks".
 */
export function buildProviderChain(env: NodeJS.ProcessEnv = process.env): LLMProvider[] {
  const timeoutMs = num(env.LLM_TIMEOUT_MS, 60000);
  const order = (env.PROVIDER_ORDER ?? 'gemini,openai,anthropic')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as ProviderName[];

  const chain: LLMProvider[] = [];

  for (const name of order) {
    if (name === 'gemini' && env.GEMINI_API_KEY) {
      chain.push(new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL ?? DEFAULT_MODELS.gemini, timeoutMs));
    } else if (name === 'openai' && env.OPENAI_API_KEY) {
      chain.push(new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL ?? DEFAULT_MODELS.openai, timeoutMs));
    } else if (name === 'anthropic' && env.ANTHROPIC_API_KEY) {
      chain.push(new AnthropicProvider(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL ?? DEFAULT_MODELS.anthropic, timeoutMs));
    }
  }

  // No fabricated fallback: if no real provider key is configured, the chain is
  // empty and the caller must surface an honest error — never invented data.
  return chain;
}

export function getMaxRepairAttempts(env: NodeJS.ProcessEnv = process.env): number {
  return num(env.MAX_REPAIR_ATTEMPTS, 2);
}
