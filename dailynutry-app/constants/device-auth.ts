import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Device identity for the gateway.
 *
 * The app holds two credentials with different jobs. The app key (see
 * `gateway-client.ts`) is baked into the bundle and identifies the APP; this
 * token is issued per install and identifies THIS DEVICE. Rate limits, daily
 * quota and revocation all hang off the device token, so a leaked app key no
 * longer buys unlimited extraction.
 *
 * The token is stored in the platform keychain/keystore rather than
 * AsyncStorage, which is plain text on disk and readable on a rooted device.
 */

const TOKEN_KEY = 'dailynutry.device.token';
const DEVICE_ID_KEY = 'dailynutry.device.id';

/**
 * SecureStore has no web implementation. Rather than fail there, fall back to
 * AsyncStorage and accept the weaker guarantee — the alternative is a web build
 * that cannot talk to the gateway at all.
 */
let secureStoreAvailable: boolean | null = null;

async function secureStoreIsAvailable(): Promise<boolean> {
  if (secureStoreAvailable === null) {
    try {
      secureStoreAvailable = await SecureStore.isAvailableAsync();
    } catch {
      secureStoreAvailable = false;
    }
  }
  return secureStoreAvailable;
}

async function readItem(key: string): Promise<string | null> {
  return (await secureStoreIsAvailable()) ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key);
}

async function writeItem(key: string, value: string): Promise<void> {
  if (await secureStoreIsAvailable()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (await secureStoreIsAvailable()) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await AsyncStorage.removeItem(key);
}

export interface DeviceCredentials {
  deviceId: string;
  token: string;
}

interface RegisterResponse {
  deviceId: string;
  token: string;
  dailyQuota: number;
}

/**
 * Registers this install with the gateway and persists the issued token.
 *
 * The gateway returns the token exactly once — it stores only a hash — so a
 * failure to persist here means the token is lost and a new registration is
 * needed. Persist first, return second.
 */
async function register(gatewayUrl: string, appKey: string): Promise<DeviceCredentials> {
  const res = await fetch(`${gatewayUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': appKey },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = data?.detail || data?.error || `HTTP ${res.status}`;
    throw new Error(`Não foi possível registrar este dispositivo: ${detail}`);
  }

  const { deviceId, token } = data as RegisterResponse;
  if (!deviceId || !token) {
    throw new Error('O gateway devolveu um registro incompleto.');
  }

  await writeItem(TOKEN_KEY, token);
  await writeItem(DEVICE_ID_KEY, deviceId);

  return { deviceId, token };
}

/**
 * Returns this device's token, registering on first use.
 *
 * Registration is deliberately lazy — it happens on the first gateway call
 * rather than at app start, so a user who never imports a plan never consumes
 * a registration slot.
 */
export async function getDeviceToken(gatewayUrl: string, appKey: string): Promise<string> {
  const existing = await readItem(TOKEN_KEY);
  if (existing) return existing;

  const credentials = await register(gatewayUrl, appKey);
  return credentials.token;
}

/**
 * Discards the stored token so the next call registers afresh.
 *
 * Called when the gateway rejects the token as unknown or revoked — which
 * happens legitimately if the device row was deleted or the database was
 * rebuilt. Without this the app would be permanently stuck on a dead token.
 */
export async function clearDeviceToken(): Promise<void> {
  await removeItem(TOKEN_KEY);
  await removeItem(DEVICE_ID_KEY);
}

/** The device id, for showing in settings or support requests. Null before registration. */
export async function getDeviceId(): Promise<string | null> {
  return readItem(DEVICE_ID_KEY);
}
