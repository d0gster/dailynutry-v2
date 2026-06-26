import {
  type LLMProvider,
  type LLMCompletion,
  type VisionExtractParams,
  type TextRepairParams,
  ProviderError,
} from '@/core/types';
import { fetchWithTimeout, isRetryableStatus } from '@/core/http';
import { REPAIR_SYSTEM_PROMPT, buildRepairUserMessage } from '@/core/prompt';

const URL = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';
const MAX_TOKENS = 8192;

/**
 * Anthropic adapter (Messages API, vision). Anthropic has no strict JSON mode,
 * so we force valid JSON by PREFILLING the assistant turn with `{` — the model
 * is then constrained to continue a JSON object. We re-prepend the `{` to the
 * returned text. Ready to activate via ANTHROPIC_API_KEY; untested live.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic' as const;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async extractStructured(params: VisionExtractParams): Promise<LLMCompletion> {
    const content = [
      { type: 'text', text: params.systemPrompt },
      ...params.images.map((img) => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
      })),
    ];
    return this.message([
      { role: 'user', content },
      { role: 'assistant', content: '{' },
    ]);
  }

  async repairJson(params: TextRepairParams): Promise<LLMCompletion> {
    return this.message(
      [
        { role: 'user', content: buildRepairUserMessage(params.brokenJson, params.validationError) },
        { role: 'assistant', content: '{' },
      ],
      REPAIR_SYSTEM_PROMPT,
    );
  }

  private async message(messages: unknown[], system?: string): Promise<LLMCompletion> {
    const res = await fetchWithTimeout(
      URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_TOKENS,
          temperature: 0.1,
          system,
          messages,
        }),
      },
      this.timeoutMs,
      this.name,
    );

    if (!res.ok) {
      const detail = await res.text();
      throw new ProviderError(
        `Anthropic ${res.status}: ${detail.slice(0, 300)}`,
        this.name,
        isRetryableStatus(res.status),
        res.status,
      );
    }

    const data = await res.json();
    const body = data.content?.[0]?.text;
    if (body == null) throw new ProviderError('Anthropic returned an empty response', this.name, true);

    // Anthropic reports cached reads SEPARATELY from input_tokens (unlike
    // Gemini/OpenAI), so no subtraction needed. Cache-WRITE tokens
    // (cache_creation_input_tokens) are billed at a higher rate and are not
    // separately priced here yet; they are 0 while provider caching is unused.
    // We prefilled with `{`, which is not echoed back — restore it.
    return {
      text: `{${body}`,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        cachedInputTokens: data.usage?.cache_read_input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      model: this.model,
      provider: this.name,
      raw: data,
    };
  }
}
