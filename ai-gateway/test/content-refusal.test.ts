import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runExtraction } from '@/core/orchestrator';
import { ContentRejectedError, ProviderError, type LLMProvider } from '@/core/types';

/**
 * A content refusal must END the provider chain.
 *
 * The bug this pins down: a safety block used to be thrown as a RETRYABLE
 * ProviderError, so the gateway responded by sending the very content one
 * provider had just refused to the next one, and then the one after — paying
 * for each rejection and distributing the material across every vendor account
 * we hold. A refusal is a verdict about the input; every provider enforces
 * comparable policies, so there is nothing to fall back to.
 */

function provider(name: 'gemini' | 'openai' | 'anthropic', behaviour: () => never | Promise<never> | Promise<{ text: string }>): LLMProvider {
  return {
    name,
    model: `${name}-test`,
    extractStructured: vi.fn(async () => {
      const result = await behaviour();
      return {
        text: (result as { text: string }).text,
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
        model: `${name}-test`,
        provider: name,
        raw: {},
      };
    }),
    repairJson: vi.fn(),
  } as unknown as LLMProvider;
}

const params = { systemPrompt: 'x', images: [{ base64: 'x', mimeType: 'image/jpeg' as const }] };

describe('content refusal in the provider chain', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stops the chain instead of forwarding refused content onward', async () => {
    const first = provider('gemini', () => {
      throw new ContentRejectedError('gemini', 'IMAGE_SAFETY');
    });
    const second = provider('openai', async () => ({ text: '{}' }));

    await expect(runExtraction([first, second], params)).rejects.toBeInstanceOf(ContentRejectedError);

    // The decisive assertion: the second provider was never called.
    expect(second.extractStructured).not.toHaveBeenCalled();
  });

  it('carries which provider refused and why, for the audit trail', async () => {
    const only = provider('gemini', () => {
      throw new ContentRejectedError('gemini', 'PROHIBITED_CONTENT');
    });

    await expect(runExtraction([only], params)).rejects.toMatchObject({
      provider: 'gemini',
      reason: 'PROHIBITED_CONTENT',
    });
  });

  it('still falls back for an ordinary transient failure', async () => {
    // The contrast that matters: a 503 IS worth retrying elsewhere. Stopping
    // the chain on refusals must not have broken normal fallback.
    const flaky = provider('gemini', () => {
      throw new ProviderError('Gemini 503: overloaded', 'gemini', true);
    });
    const healthy = provider('openai', async () => ({ text: '{"ok":true}' }));

    const result = await runExtraction([flaky, healthy], params);

    expect(result.providerUsed.name).toBe('openai');
    expect(healthy.extractStructured).toHaveBeenCalledOnce();
  });
});
