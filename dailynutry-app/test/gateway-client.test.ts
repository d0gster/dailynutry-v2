import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The app key is captured at module scope, mirroring how EXPO_PUBLIC_* values
// are inlined at build time — so it has to be set before the import below, not
// in beforeEach.
vi.hoisted(() => {
  process.env.EXPO_PUBLIC_GATEWAY_API_KEY = 'test-app-key';
});

// expo-constants and the device-auth module both reach for native APIs that
// don't exist under Node, so they're replaced wholesale.
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '10.0.0.5:8081' } } }));

const getDeviceToken = vi.hoisted(() => vi.fn());
const clearDeviceToken = vi.hoisted(() => vi.fn());
vi.mock('@/constants/device-auth', () => ({ getDeviceToken, clearDeviceToken }));

import { fetchModels, parseViaGateway } from '@/constants/gateway-client';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('gateway-client', () => {
  beforeEach(() => {
    vi.stubEnv('EXPO_PUBLIC_GATEWAY_URL', 'https://gateway.example');
    getDeviceToken.mockReset().mockResolvedValue('device-token-1');
    clearDeviceToken.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends both credentials: the app key and the device token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { defaultModel: 'gemini-x', models: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchModels();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gateway.example/api/models');
    expect(init.headers['x-api-key']).toBe('test-app-key');
    expect(init.headers.Authorization).toBe('Bearer device-token-1');
  });

  it('discards a stale token and retries once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'Unknown device token' }))
      .mockResolvedValueOnce(jsonResponse(200, { defaultModel: 'gemini-x', models: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchModels();

    expect(clearDeviceToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.defaultModel).toBe('gemini-x');
  });

  it('does NOT retry a revoked device — re-registering would undo the revocation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(403, { error: 'This device has been revoked' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchModels()).rejects.toThrow(/revoked/i);
    expect(clearDeviceToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries a stale token only once, then gives up', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: 'Unknown device token' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchModels()).rejects.toThrow(/Gateway:/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a non-https gateway URL in a production build', async () => {
    vi.stubEnv('EXPO_PUBLIC_GATEWAY_URL', 'http://gateway.example');
    vi.stubGlobal('fetch', vi.fn());

    await expect(fetchModels()).rejects.toThrow(/https:\/\//);
  });

  it('fails loudly when no gateway URL is configured in production', async () => {
    vi.stubEnv('EXPO_PUBLIC_GATEWAY_URL', '');
    vi.stubGlobal('fetch', vi.fn());

    await expect(fetchModels()).rejects.toThrow(/EXPO_PUBLIC_GATEWAY_URL is not set/);
  });

  it('strips the data-URI prefix before sending images', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { plan: { meals: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await parseViaGateway(['data:image/jpeg;base64,AAAA']);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.images).toEqual([{ base64: 'AAAA', mimeType: 'image/jpeg' }]);
  });

  it('omits overrideModel unless one was chosen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { plan: { meals: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await parseViaGateway(['AAAA']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('overrideModel');

    await parseViaGateway(['AAAA'], undefined, 'gemini-custom');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).overrideModel).toBe('gemini-custom');
  });

  it('reports a fallback provider through onProgress', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, {
        plan: { meals: [] },
        meta: { fallbackReason: 'timeout', providerUsed: 'openai' },
      }),
    ));

    const progress = vi.fn();
    await parseViaGateway(['AAAA'], progress);

    expect(progress).toHaveBeenCalledWith(expect.stringContaining('openai'));
  });
});
