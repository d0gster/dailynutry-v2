import Constants from 'expo-constants';
import { DietPlan } from './foods';
import { getDeviceToken, clearDeviceToken } from './device-auth';

const GATEWAY_PORT = 4000;

/**
 * Gateway credential.
 *
 * ⚠️ This is NOT a secret. `EXPO_PUBLIC_*` variables are inlined into the
 * JavaScript bundle at build time, so this string ships inside the app binary
 * and anyone who unpacks it can read it — that is a property of mobile clients,
 * not of this variable. Reading it from the environment only keeps the dev key
 * out of a production build; it does not protect the key.
 *
 * The real fix is per-user tokens issued by the gateway after a login, so a
 * leaked credential is scoped to one account and can be revoked.
 */
const GATEWAY_API_KEY = process.env.EXPO_PUBLIC_GATEWAY_API_KEY ?? '';

/**
 * Resolves the gateway base URL.
 *
 * In development we derive it from the Expo host so a phone on the same Wi-Fi
 * reaches the dev machine without configuration. That mechanism does not exist
 * in a standalone build, so production REQUIRES an explicit URL and fails loudly
 * without one — the previous `localhost` fallback made a misconfigured build
 * look like a network error on every import.
 */
function getGatewayUrl(): string {
  const configured = process.env.EXPO_PUBLIC_GATEWAY_URL?.trim();

  if (configured) {
    // Android 9+ blocks cleartext traffic by default, and an API key over plain
    // HTTP is readable by anything on the network path.
    if (!__DEV__ && !configured.startsWith('https://')) {
      throw new Error(
        'EXPO_PUBLIC_GATEWAY_URL must use https:// in a production build.',
      );
    }
    return configured.replace(/\/+$/, '');
  }

  if (__DEV__) {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      return `http://${ip}:${GATEWAY_PORT}`;
    }
    return `http://localhost:${GATEWAY_PORT}`;
  }

  throw new Error(
    'EXPO_PUBLIC_GATEWAY_URL is not set. A production build cannot reach the gateway without it.',
  );
}

// ─── Model info returned by /api/models ────────────────────────────────────

export interface GatewayModel {
  id: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
}

export interface ModelsResponse {
  defaultModel: string;
  models: GatewayModel[];
}

/**
 * Calls the gateway with both credentials: the app key and this device's token.
 *
 * A rejected device token is RECOVERABLE — it happens when the device row was
 * removed or the database rebuilt — so the token is discarded and the call
 * retried once with a fresh registration. A REVOKED device (403) is deliberate
 * and must not be retried: re-registering would defeat the revocation.
 */
async function gatewayFetch(
  path: string,
  init: RequestInit = {},
  allowRetry = true,
): Promise<unknown> {
  const gatewayUrl = getGatewayUrl();
  const token = await getDeviceToken(gatewayUrl, GATEWAY_API_KEY);

  const res = await fetch(`${gatewayUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      'x-api-key': GATEWAY_API_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => null);

  if (res.ok) return data;

  const error = String((data as { error?: string })?.error ?? '');
  const staleToken =
    res.status === 401 && /unknown device token|device registration required/i.test(error);

  if (staleToken && allowRetry) {
    await clearDeviceToken();
    return gatewayFetch(path, init, false);
  }

  const detail =
    (data as { detail?: string; error?: string })?.detail ??
    (data as { error?: string })?.error ??
    `HTTP ${res.status}`;
  throw new Error(`Gateway: ${detail}`);
}

/**
 * Fetch available Gemini models from the gateway.
 */
export async function fetchModels(): Promise<ModelsResponse> {
  return (await gatewayFetch('/api/models', { method: 'GET' })) as ModelsResponse;
}

// ─── Diet extraction ───────────────────────────────────────────────────────

export async function parseViaGateway(
  base64Images: string[],
  onProgress?: (status: string) => void,
  overrideModel?: string | null,
): Promise<Partial<DietPlan>> {
  onProgress?.('Enviando imagens para o gateway de IA...');

  const images = base64Images.map((img) => ({
    base64: img.replace(/^data:image\/\w+;base64,/, ''),
    mimeType: 'image/jpeg' as const,
  }));

  const payload: Record<string, unknown> = { images };
  if (overrideModel) {
    payload.overrideModel = overrideModel;
  }

  const data = (await gatewayFetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })) as { plan: Partial<DietPlan>; meta?: { fallbackReason?: string; providerUsed?: string } };

  if (data?.meta?.fallbackReason) {
    onProgress?.(`IA primária indisponível — usando fallback (${data.meta.providerUsed}).`);
  }

  return data.plan;
}
