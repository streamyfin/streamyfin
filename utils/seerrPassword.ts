import * as SecureStore from "expo-secure-store";
import {
  LEGACY_SEERR_PASSWORD_KEY_PREFIX,
  SEERR_PASSWORD_KEY_PREFIX,
} from "@/constants/Seerr";

function seerrPasswordKey(
  serverUrl: string,
  userId: string,
  prefix = SEERR_PASSWORD_KEY_PREFIX,
): string {
  const encoded = btoa(`${serverUrl}:${userId}`).replace(/[^a-zA-Z0-9]/g, "_");
  return `${prefix}${encoded}`;
}

/**
 * Remember the Jellyfin password so Seerr can be signed in automatically
 * on launch.
 *
 * Seerr's /auth/jellyfin endpoint authenticates with the *password*, not
 * the Jellyfin access token, so there is no token-shaped way to do this: the
 * password itself has to be kept. It lives in the platform secure store
 * (Keychain / Android Keystore, and the OS keystore via Electron safeStorage on
 * desktop), never in MMKV. Only stored when the user opts in via the
 * `autoLoginSeerr` setting, and removed on logout with the rest of the
 * account's credentials.
 */
export async function saveSeerrPassword(
  serverUrl: string,
  userId: string,
  password: string,
): Promise<void> {
  await SecureStore.setItemAsync(seerrPasswordKey(serverUrl, userId), password);
  // A copy an earlier build kept under the old name is stale from here on.
  await SecureStore.deleteItemAsync(
    seerrPasswordKey(serverUrl, userId, LEGACY_SEERR_PASSWORD_KEY_PREFIX),
  );
}

export async function getSeerrPassword(
  serverUrl: string,
  userId: string,
): Promise<string | null> {
  const key = seerrPasswordKey(serverUrl, userId);
  const current = await SecureStore.getItemAsync(key);
  if (current !== null) return current;

  // Kept by a build from before the rename: moved on first use.
  const legacyKey = seerrPasswordKey(
    serverUrl,
    userId,
    LEGACY_SEERR_PASSWORD_KEY_PREFIX,
  );
  const legacy = await SecureStore.getItemAsync(legacyKey);
  if (legacy !== null) {
    await SecureStore.setItemAsync(key, legacy);
    await SecureStore.deleteItemAsync(legacyKey);
  }
  return legacy;
}

/** Forgets the password under its current name and the one it had before. */
export async function deleteSeerrPassword(
  serverUrl: string,
  userId: string,
): Promise<void> {
  await SecureStore.deleteItemAsync(seerrPasswordKey(serverUrl, userId));
  await SecureStore.deleteItemAsync(
    seerrPasswordKey(serverUrl, userId, LEGACY_SEERR_PASSWORD_KEY_PREFIX),
  );
}
