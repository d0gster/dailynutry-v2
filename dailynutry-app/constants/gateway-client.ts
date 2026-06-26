import { DietPlan } from './foods';

/**
 * Calls the DailyNutry AI Gateway instead of hitting Gemini directly.
 *
 * This is the path the project is moving TO: keys live on the gateway, and
 * fallback / guardrails / cost tracking all happen server-side. The legacy
 * direct-Gemini path in `dietbox-parser.ts` is kept as a fallback for when no
 * gateway is configured, so the app never stops working.
 */
export async function parseViaGateway(
  base64Images: string[],
  gatewayUrl: string,
  gatewayApiKey: string,
  onProgress?: (status: string) => void,
): Promise<Partial<DietPlan>> {
  onProgress?.('Enviando imagens para o gateway de IA...');

  const images = base64Images.map((img) => ({
    base64: img.replace(/^data:image\/\w+;base64,/, ''),
    mimeType: 'image/jpeg' as const,
  }));

  const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/api/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': gatewayApiKey,
    },
    body: JSON.stringify({ images }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data?.detail || data?.error || `HTTP ${res.status}`;
    throw new Error(`Gateway: ${detail}`);
  }

  if (data?.meta?.fallbackReason) {
    onProgress?.(`IA primária indisponível — usando fallback (${data.meta.providerUsed}).`);
  }

  return data.plan as Partial<DietPlan>;
}
