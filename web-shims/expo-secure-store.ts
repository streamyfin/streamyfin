// Web (desktop) shim for expo-secure-store.
//
// expo-secure-store is native-only — every call throws UnavailabilityError on
// web, which is what surfaces as "Account was not saved" when you pick a
// security option for a saved account.
//
// In the Electron shell this delegates to the main process, which encrypts
// values with the OS keystore (DPAPI on Windows, Keychain on macOS,
// libsecret on Linux) via Electron's safeStorage. In a plain browser there is
// no keystore, so it falls back to localStorage — no worse than the active
// Jellyfin token, which react-native-mmkv already keeps there.

type DesktopSecureStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

const bridge = (): DesktopSecureStore | undefined =>
  (globalThis as { streamyfinDesktop?: { secureStore?: DesktopSecureStore } })
    .streamyfinDesktop?.secureStore;

const FALLBACK_PREFIX = "streamyfin.securestore.";

// expo-secure-store's keychain accessibility constants. They only mean anything
// to the native implementation; callers still reference them, so they have to
// exist.
export const AFTER_FIRST_UNLOCK = "AFTER_FIRST_UNLOCK";
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY =
  "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY";
export const ALWAYS = "ALWAYS";
export const ALWAYS_THIS_DEVICE_ONLY = "ALWAYS_THIS_DEVICE_ONLY";
export const WHEN_PASSCODE_SET_THIS_DEVICE_ONLY =
  "WHEN_PASSCODE_SET_THIS_DEVICE_ONLY";
export const WHEN_UNLOCKED = "WHEN_UNLOCKED";
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = "WHEN_UNLOCKED_THIS_DEVICE_ONLY";

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

/** Desktop has no biometric prompt wired up. */
export function canUseBiometricAuthentication(): boolean {
  return false;
}

export async function setItemAsync(
  key: string,
  value: string,
  _options?: unknown,
): Promise<void> {
  const desktop = bridge();
  if (desktop) return desktop.set(key, value);
  localStorage.setItem(FALLBACK_PREFIX + key, value);
}

export async function getItemAsync(
  key: string,
  _options?: unknown,
): Promise<string | null> {
  const desktop = bridge();
  if (desktop) return desktop.get(key);
  return localStorage.getItem(FALLBACK_PREFIX + key);
}

export async function deleteItemAsync(
  key: string,
  _options?: unknown,
): Promise<void> {
  const desktop = bridge();
  if (desktop) return desktop.delete(key);
  localStorage.removeItem(FALLBACK_PREFIX + key);
}

// Legacy aliases still referenced in the codebase.
export const setValueWithKeyAsync = setItemAsync;
export const getValueWithKeyAsync = getItemAsync;
export const deleteValueWithKeyAsync = deleteItemAsync;

/**
 * Sync variants. The desktop bridge is async, so these can only see the
 * localStorage fallback — they are used for best-effort reads, never for
 * storing credentials.
 */
export function getValueWithKeySync(key: string): string | null {
  return localStorage.getItem(FALLBACK_PREFIX + key);
}

export function setValueWithKeySync(key: string, value: string): void {
  localStorage.setItem(FALLBACK_PREFIX + key, value);
}
