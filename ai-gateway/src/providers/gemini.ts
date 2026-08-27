import {
  type LLMProvider,
  type LLMCompletion,
  type VisionExtractParams,
  type TextRepairParams,
  ProviderError,
  ContentRejectedError,
} from '@/core/types';
import { fetchWithTimeout, isRetryableStatus } from '@/core/http';
import { REPAIR_SYSTEM_PROMPT, buildRepairUserMessage } from '@/core/prompt';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** `finishReason` values that mean the content was refused, not that the model
 *  ran out of room or stopped normally. */
const REFUSAL_FINISH_REASONS = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
  'SPII',
  'IMAGE_SAFETY',
]);

/**
 * Google Gemini adapter (REST, no SDK). Supports both the vision extraction
 * call and the text-only repair call.
 */
export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini' as const;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async extractStructured(params: VisionExtractParams): Promise<LLMCompletion> {
    const parts = [
      { text: params.systemPrompt },
      ...params.images.map((img) => ({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      })),
    ];
    return this.generate(parts);
  }

  async repairJson(params: TextRepairParams): Promise<LLMCompletion> {
    const parts = [
      { text: `${REPAIR_SYSTEM_PROMPT}\n\n${buildRepairUserMessage(params.brokenJson, params.validationError)}` },
    ];
    return this.generate(parts);
  }

  private async generate(parts: unknown[]): Promise<LLMCompletion> {
    const url = `${BASE}/${this.model}:generateContent?key=${this.apiKey}`;
    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    });

    const res = await fetchWithTimeout(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      this.timeoutMs,
      this.name,
    );

    if (!res.ok) {
      const detail = await res.text();
      throw new ProviderError(
        `Gemini ${res.status}: ${detail.slice(0, 300)}`,
        this.name,
        isRetryableStatus(res.status),
        res.status,
      );
    }

    const data = await res.json();

    // Gemini reports a content refusal in two places: `promptFeedback` when it
    // rejected the INPUT outright, and `finishReason` when it stopped partway.
    // Both used to arrive here as an empty candidate and were retried against
    // the next provider — which forwarded the same rejected content onward.
    // Reading the reason is what lets us stop instead.
    const blockReason = data.promptFeedback?.blockReason;
    const finishReason = data.candidates?.[0]?.finishReason;
    if (blockReason) {
      throw new ContentRejectedError(this.name, String(blockReason));
    }
    if (finishReason && REFUSAL_FINISH_REASONS.has(String(finishReason))) {
      throw new ContentRejectedError(this.name, String(finishReason));
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      // Empty with no reason given: a genuine hiccup, so the fallback applies.
      throw new ProviderError('Gemini returned an empty response', this.name, true);
    }

    // Gemini's promptTokenCount INCLUDES cachedContentTokenCount, so subtract
    // the cached part to get the full-price input count.
    const cached = data.usageMetadata?.cachedContentTokenCount ?? 0;
    const prompt = data.usageMetadata?.promptTokenCount ?? 0;
    return {
      text,
      usage: {
        inputTokens: Math.max(0, prompt - cached),
        cachedInputTokens: cached,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      model: this.model,
      provider: this.name,
      raw: data,
    };
  }
}
