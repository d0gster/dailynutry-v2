import {
  type LLMProvider,
  type LLMCompletion,
  type VisionExtractParams,
  type TextRepairParams,
  ProviderError,
} from '@/core/types';
import { fetchWithTimeout, isRetryableStatus } from '@/core/http';
import { REPAIR_SYSTEM_PROMPT, buildRepairUserMessage } from '@/core/prompt';

const URL = 'https://api.openai.com/v1/chat/completions';

/**
 * OpenAI adapter (Chat Completions, vision + JSON mode). Ready to activate:
 * the moment OPENAI_API_KEY is set, the router picks it up as a fallback.
 * Untested against a live key yet — kept deliberately close to the documented
 * REST contract so validation later is a matter of dropping a key in `.env`.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai' as const;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async extractStructured(params: VisionExtractParams): Promise<LLMCompletion> {
    const content = [
      { type: 'text', text: params.systemPrompt },
      ...params.images.map((img) => ({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
      })),
    ];
    return this.chat([{ role: 'user', content }]);
  }

  async repairJson(params: TextRepairParams): Promise<LLMCompletion> {
    return this.chat([
      { role: 'system', content: REPAIR_SYSTEM_PROMPT },
      { role: 'user', content: buildRepairUserMessage(params.brokenJson, params.validationError) },
    ]);
  }

  private async chat(messages: unknown[]): Promise<LLMCompletion> {
    const res = await fetchWithTimeout(
      URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      },
      this.timeoutMs,
      this.name,
    );

    if (!res.ok) {
      const detail = await res.text();
      throw new ProviderError(
        `OpenAI ${res.status}: ${detail.slice(0, 300)}`,
        this.name,
        isRetryableStatus(res.status),
        res.status,
      );
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new ProviderError('OpenAI returned an empty response', this.name, true);

    // OpenAI's prompt_tokens INCLUDES cached tokens, so subtract them out.
    const cached = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const prompt = data.usage?.prompt_tokens ?? 0;
    return {
      text,
      usage: {
        inputTokens: Math.max(0, prompt - cached),
        cachedInputTokens: cached,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      model: this.model,
      provider: this.name,
      raw: data,
    };
  }
}
