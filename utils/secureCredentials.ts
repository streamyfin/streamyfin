import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  bumpCustomHeadersVersion,
  deleteSecureCustomHeaderValues,
  resolveCustomHeaderValues,
  secureCustomHeaderMetadata,
} from "./customHeaders/secureValues";
import type { CustomHeader } from "./customHeaders/types";
import { mintDeviceId } from "./device";
import { logAndCaptureError } from "./log";
import { storage } from "./mmkv";

const CREDENTIAL_KEY_PREFIX = "credential_";
const MULTI_ACCOUNT_MIGRATED_KEY = "multiAccountMigrated";

/**
 * Security type for saved accounts.
 */
export type AccountSecurityType = "none" | "pin" | "password";

/**
 * Credential stored in secure storage for a specific account.
 */
export interface ServerCredential {
  serverUrl: string;
  serverName: string;
  token: string;
  userId: string;
  username: string;
  savedAt: number;
  securityType: AccountSecurityType;
  pinHash?: string;
  primaryImageTag?: string;
  /** Device id the token was issued under. Undefined on accounts saved before
   * this was introduced. */
  deviceId?: string;
}

/**
 * Account summary stored in SavedServer for display in UI.
 */
export interface SavedServerAccount {
  userId: string;
  username: string;
  securityType: AccountSecurityType;
  savedAt: number;
  primaryImageTag?: string;
  /** Mirrors ServerCredential.deviceId so a login can resolve it without
   * touching secure storage. */
  deviceId?: string;
}

/**
 * Local network configuration for automatic URL switching.
 */
export interface LocalNetworkConfig {
  localUrl: string;
  homeWifiSSIDs: string[];
  enabled: boolean;
}

/**
 * Server with multiple saved accounts.
 */
export interface SavedServer {
  address: string;
  name?: string;
  accounts: SavedServerAccount[];
  localNetworkConfig?: LocalNetworkConfig;
  /** Proxy auth headers for this server; values live in SecureStore. */
  customHeaders?: CustomHeader[];
}

/**
 * Legacy interface for migration purposes.
 */
interface LegacySavedServer {
  address: string;
  name?: string;
  hasCredentials?: boolean;
  username?: string;
}

/**
 * Legacy credential interface for migration purposes.
 */
interface LegacyServerCredential {
  serverUrl: string;
  serverName: string;
  token: string;
  userId: string;
  username: string;
  savedAt: number;
}

/**
 * Encode server URL to valid secure store key (legacy, for migration).
 */
export function serverUrlToKey(serverUrl: string): string {
  const encoded = btoa(serverUrl).replace(/[^a-zA-Z0-9]/g, "_");
  return `${CREDENTIAL_KEY_PREFIX}${encoded}`;
}

/**
 * Generate credential key for a specific account (serverUrl + userId).
 */
export function credentialKey(serverUrl: string, userId: string): string {
  const combined = `${serverUrl}:${userId}`;
  const encoded = btoa(combined).replace(/[^a-zA-Z0-9]/g, "_");
  return `${CREDENTIAL_KEY_PREFIX}${encoded}`;
}

const JELLYSEERR_PASSWORD_KEY_PREFIX = "jellyseerrpw_";

function jellyseerrPasswordKey(serverUrl: string, userId: string): string {
  const encoded = btoa(`${serverUrl}:${userId}`).replace(/[^a-zA-Z0-9]/g, "_");
  return `${JELLYSEERR_PASSWORD_KEY_PREFIX}${encoded}`;
}

/**
 * Remember the Jellyfin password so Jellyseerr can be signed in automatically
 * on launch.
 *
 * Jellyseerr's /auth/jellyfin endpoint authenticates with the *password*, not
 * the Jellyfin access token, so there is no token-shaped way to do this — the
 * password itself has to be kept. It lives in the platform secure store
 * (Keychain / Android Keystore, and the OS keystore via Electron safeStorage on
 * desktop), never in MMKV. Only stored when the user opts in via the
 * `autoLoginJellyseerr` setting, and removed on logout with the rest of the
 * account's credentials.
 */
export async function saveJellyseerrPassword(
  serverUrl: string,
  userId: string,
  password: string,
): Promise<void> {
  await SecureStore.setItemAsync(
    jellyseerrPasswordKey(serverUrl, userId),
    password,
  );
}

export async function getJellyseerrPassword(
  serverUrl: string,
  userId: string,
): Promise<string | null> {
  return SecureStore.getItemAsync(jellyseerrPasswordKey(serverUrl, userId));
}

export async function deleteJellyseerrPassword(
  serverUrl: string,
  userId: string,
): Promise<void> {
  await SecureStore.deleteItemAsync(jellyseerrPasswordKey(serverUrl, userId));
}

/**
 * Hash a PIN using SHA256.
 */
export async function hashPIN(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin,
  );
}

/**
 * Verify a PIN against stored hash.
 */
export async function verifyAccountPIN(
  serverUrl: string,
  userId: string,
  pin: string,
): Promise<boolean> {
  const credential = await getAccountCredential(serverUrl, userId);
  if (!credential?.pinHash) return false;
  const inputHash = await hashPIN(pin);
  return inputHash === credential.pinHash;
}

/**
 * Project a credential onto its display-side account summary.
 */
function toSavedAccount(credential: ServerCredential): SavedServerAccount {
  return {
    userId: credential.userId,
    username: credential.username,
    securityType: credential.securityType,
    savedAt: credential.savedAt,
    primaryImageTag: credential.primaryImageTag,
    deviceId: credential.deviceId,
  };
}

/**
 * Save credential for a specific account.
 */
export async function saveAccountCredential(
  credential: ServerCredential,
): Promise<void> {
  const key = credentialKey(credential.serverUrl, credential.userId);
  await SecureStore.setItemAsync(key, JSON.stringify(credential));

  // Update previousServers to include this account
  addAccountToServer(
    credential.serverUrl,
    credential.serverName,
    toSavedAccount(credential),
  );
}

/**
 * Resolve the device id to authenticate a username under. Jellyfin binds one
 * access token per device id, so accounts must not share one: a known account
 * reuses its own id, anyone else gets a fresh one.
 */
export function resolveDeviceIdForLogin(
  serverUrl: string,
  username: string,
): string {
  const server = getPreviousServers().find((s) => s.address === serverUrl);
  // Jellyfin accepts any casing at login, so match case-insensitively — a
  // case-only difference must not mint a second id for the same account.
  const existing = server?.accounts.find(
    (a) => a.username.toLowerCase() === username.toLowerCase(),
  );
  return existing?.deviceId || mintDeviceId();
}

/**
 * Adopt the legacy install-wide device id for the currently signed-in account,
 * whose token was issued under it. Regenerating instead would revoke it.
 */
export async function migrateCurrentAccountDeviceId(
  serverUrl: string,
  userId: string,
  legacyDeviceId: string,
): Promise<void> {
  const credential = await getAccountCredential(serverUrl, userId);
  if (!credential || credential.deviceId) return;

  credential.deviceId = legacyDeviceId;
  await SecureStore.setItemAsync(
    credentialKey(serverUrl, userId),
    JSON.stringify(credential),
  );
  addAccountToServer(
    serverUrl,
    credential.serverName,
    toSavedAccount(credential),
  );
}

/**
 * Persist a successful sign-in: refresh a known account's token, or save the
 * account if this is the first time it has signed in on this device.
 *
 * Quick Connect has no "save this account" step — whoever approves the code
 * decides who signs in — so without this an account added that way would
 * authenticate but never appear in the switcher.
 */
export async function recordAccountSignIn(params: {
  serverUrl: string;
  userId: string;
  username: string;
  token: string;
  deviceId: string;
  primaryImageTag?: string;
}): Promise<void> {
  const existing = await getAccountCredential(params.serverUrl, params.userId);
  if (existing) {
    await updateAccountToken(
      params.serverUrl,
      params.userId,
      params.token,
      params.primaryImageTag,
      params.deviceId,
    );
    return;
  }
  await saveAccountCredential({
    serverUrl: params.serverUrl,
    // Empty keeps whatever name the server list already holds.
    serverName: "",
    token: params.token,
    userId: params.userId,
    username: params.username,
    savedAt: Date.now(),
    securityType: "none",
    primaryImageTag: params.primaryImageTag,
    deviceId: params.deviceId,
  });
}

/**
 * Retrieve credential for a specific account.
 */
export async function getAccountCredential(
  serverUrl: string,
  userId: string,
): Promise<ServerCredential | null> {
  const key = credentialKey(serverUrl, userId);
  const stored = await SecureStore.getItemAsync(key);

  if (stored) {
    try {
      return JSON.parse(stored) as ServerCredential;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Delete credential for a specific account.
 */
export async function deleteAccountCredential(
  serverUrl: string,
  userId: string,
): Promise<void> {
  const key = credentialKey(serverUrl, userId);
  await SecureStore.deleteItemAsync(key);

  // Forgetting the account also forgets its Jellyseerr password — it must
  // not outlive the credential it belongs to.
  await deleteJellyseerrPassword(serverUrl, userId);

  // Remove account from previousServers
  removeAccountFromServer(serverUrl, userId);
}

/**
 * Get all credentials for a server (by iterating through accounts).
 */
export async function getServerAccounts(
  serverUrl: string,
): Promise<ServerCredential[]> {
  const servers = getPreviousServers();
  const server = servers.find((s) => s.address === serverUrl);
  if (!server) return [];

  const credentials: ServerCredential[] = [];
  for (const account of server.accounts) {
    const credential = await getAccountCredential(serverUrl, account.userId);
    if (credential) {
      credentials.push(credential);
    }
  }
  return credentials;
}

/**
 * Check if credentials exist for a specific account.
 */
export async function hasAccountCredential(
  serverUrl: string,
  userId: string,
): Promise<boolean> {
  const key = credentialKey(serverUrl, userId);
  const stored = await SecureStore.getItemAsync(key);
  return stored !== null;
}

/**
 * Add or update an account in a server's accounts list.
 */
export function addAccountToServer(
  serverUrl: string,
  serverName: string,
  account: SavedServerAccount,
): void {
  const previousServers = getPreviousServers();
  let serverFound = false;

  const updatedServers = previousServers.map((server) => {
    if (server.address === serverUrl) {
      serverFound = true;
      // Check if account already exists
      const existingIndex = server.accounts.findIndex(
        (a) => a.userId === account.userId,
      );
      if (existingIndex >= 0) {
        // Update existing account
        const updatedAccounts = [...server.accounts];
        updatedAccounts[existingIndex] = account;
        return {
          ...server,
          name: serverName || server.name,
          accounts: updatedAccounts,
        };
      }
      // Add new account
      return {
        ...server,
        name: serverName || server.name,
        accounts: [...server.accounts, account],
      };
    }
    return server;
  });

  // If server not found, add it
  if (!serverFound) {
    updatedServers.push({
      address: serverUrl,
      name: serverName,
      accounts: [account],
    });
  }

  storage.set("previousServers", JSON.stringify(updatedServers));
}

/**
 * Remove an account from a server's accounts list.
 */
function removeAccountFromServer(serverUrl: string, userId: string): void {
  const previousServers = getPreviousServers();

  const updatedServers = previousServers.map((server) => {
    if (server.address === serverUrl) {
      return {
        ...server,
        accounts: server.accounts.filter((a) => a.userId !== userId),
      };
    }
    return server;
  });

  storage.set("previousServers", JSON.stringify(updatedServers));
}

/**
 * Get previous servers list from MMKV.
 */
export function getPreviousServers(): SavedServer[] {
  const stored = storage.getString("previousServers");
  if (stored) {
    try {
      return JSON.parse(stored) as SavedServer[];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Remove a server from the list and delete all its account credentials.
 */
export async function removeServerFromList(serverUrl: string): Promise<void> {
  const servers = getPreviousServers();
  const server = servers.find((s) => s.address === serverUrl);

  // Delete all account credentials for this server
  if (server) {
    for (const account of server.accounts) {
      const key = credentialKey(serverUrl, account.userId);
      await SecureStore.deleteItemAsync(key);
    }
    deleteSecureCustomHeaderValues(server.customHeaders ?? []);
  }

  // Remove server from list
  const filtered = servers.filter((s) => s.address !== serverUrl);
  storage.set("previousServers", JSON.stringify(filtered));
  // The header values are gone; anything caching them has to re-read.
  bumpCustomHeadersVersion();
}

/**
 * Add a server to the list without credentials (for server discovery).
 */
export function addServerToList(serverUrl: string, serverName?: string): void {
  const servers = getPreviousServers();
  const existing = servers.find((s) => s.address === serverUrl);

  if (existing) {
    // Update name if provided
    if (serverName) {
      const updated = servers.map((s) =>
        s.address === serverUrl ? { ...s, name: serverName } : s,
      );
      storage.set("previousServers", JSON.stringify(updated));
    }
    return;
  }

  // Add new server with empty accounts
  const newServer: SavedServer = {
    address: serverUrl,
    name: serverName,
    accounts: [],
  };

  // Keep max 10 servers
  const updatedServers = [newServer, ...servers].slice(0, 10);
  storage.set("previousServers", JSON.stringify(updatedServers));
}

/**
 * Update local network configuration for a server.
 */
export function updateServerLocalConfig(
  serverUrl: string,
  config: LocalNetworkConfig | undefined,
): void {
  const servers = getPreviousServers();
  const updatedServers = servers.map((server) => {
    if (server.address === serverUrl) {
      return {
        ...server,
        localNetworkConfig: config,
      };
    }
    return server;
  });
  storage.set("previousServers", JSON.stringify(updatedServers));
}

/**
 * Get local network configuration for a server.
 */
export function getServerLocalConfig(
  serverUrl: string,
): LocalNetworkConfig | undefined {
  const servers = getPreviousServers();
  const server = servers.find((s) => s.address === serverUrl);
  return server?.localNetworkConfig;
}

/**
 * Replace the custom proxy headers for a server. Values are moved into
 * SecureStore; only their names and SecureStore keys reach MMKV.
 *
 * The server entry is created if it doesn't exist yet — headers are configured
 * during login, before the server has any accounts.
 */
export function updateServerCustomHeaders(
  serverUrl: string,
  headers: CustomHeader[],
): void {
  const servers = getPreviousServers();
  const existingIndex = servers.findIndex((s) => s.address === serverUrl);
  const previousHeaders =
    existingIndex >= 0 ? (servers[existingIndex].customHeaders ?? []) : [];

  // `headers` carries the values as typed; re-reading them from SecureStore
  // here would hand back the previous secret and silently discard the edit.
  const customHeaders = secureCustomHeaderMetadata(
    `server:${serverUrl}`,
    headers,
    previousHeaders,
  );

  if (existingIndex >= 0) {
    servers[existingIndex] = { ...servers[existingIndex], customHeaders };
  } else {
    // Same placement and cap as addServerToList — headers are configured before
    // the connection succeeds, so this can be what creates the entry.
    servers.unshift({ address: serverUrl, accounts: [], customHeaders });
    servers.splice(10);
  }

  storage.set("previousServers", JSON.stringify(servers));
  bumpCustomHeadersVersion();
}

/**
 * Custom proxy headers for a server, with their SecureStore values filled in.
 */
export function getServerCustomHeaders(serverUrl: string): CustomHeader[] {
  const servers = getPreviousServers();
  const server = servers.find((s) => s.address === serverUrl);
  // This is a read: it must not write, because it runs during render (every
  // <Image> resolves its headers through it).
  return resolveCustomHeaderValues(server?.customHeaders ?? []);
}

/**
 * Migrate from legacy single-account format to multi-account format.
 * Should be called on app startup.
 */
export async function migrateToMultiAccount(): Promise<void> {
  // Check if already migrated
  if (storage.getBoolean(MULTI_ACCOUNT_MIGRATED_KEY)) {
    return;
  }

  const stored = storage.getString("previousServers");
  if (!stored) {
    storage.set(MULTI_ACCOUNT_MIGRATED_KEY, true);
    return;
  }

  try {
    const servers = JSON.parse(stored);

    // Check if already in new format (has accounts array)
    if (servers.length > 0 && Array.isArray(servers[0].accounts)) {
      storage.set(MULTI_ACCOUNT_MIGRATED_KEY, true);
      return;
    }

    // Migrate from legacy format
    const migratedServers: SavedServer[] = [];

    for (const legacyServer of servers as LegacySavedServer[]) {
      const newServer: SavedServer = {
        address: legacyServer.address,
        name: legacyServer.name,
        accounts: [],
      };

      // Try to get existing credential using legacy key
      if (legacyServer.hasCredentials) {
        const legacyKey = serverUrlToKey(legacyServer.address);
        const storedCred = await SecureStore.getItemAsync(legacyKey);

        if (storedCred) {
          try {
            const legacyCred = JSON.parse(storedCred) as LegacyServerCredential;

            // Create new credential with security type
            const newCredential: ServerCredential = {
              ...legacyCred,
              securityType: "none", // Existing accounts get no protection (preserve quick-login)
            };

            // Save with new key format
            const newKey = credentialKey(
              legacyServer.address,
              legacyCred.userId,
            );
            await SecureStore.setItemAsync(
              newKey,
              JSON.stringify(newCredential),
            );

            // Delete old key
            await SecureStore.deleteItemAsync(legacyKey);

            // Add account to server
            newServer.accounts.push({
              userId: legacyCred.userId,
              username: legacyCred.username,
              securityType: "none",
              savedAt: legacyCred.savedAt,
            });
          } catch {
            // Skip invalid credentials
          }
        }
      }

      migratedServers.push(newServer);
    }

    storage.set("previousServers", JSON.stringify(migratedServers));
    storage.set(MULTI_ACCOUNT_MIGRATED_KEY, true);
  } catch (error) {
    // If parsing fails, reset to empty array. This destroys the user's saved
    // server list, so it must never happen silently.
    logAndCaptureError(
      "Saved-servers migration failed; resetting previousServers",
      error,
    );
    storage.set("previousServers", "[]");
    storage.set(MULTI_ACCOUNT_MIGRATED_KEY, true);
  }
}

/**
 * Update account's token and optionally other fields after successful login.
 */
export async function updateAccountToken(
  serverUrl: string,
  userId: string,
  newToken: string,
  primaryImageTag?: string,
  deviceId?: string,
): Promise<void> {
  const credential = await getAccountCredential(serverUrl, userId);
  if (credential) {
    credential.token = newToken;
    credential.savedAt = Date.now();
    if (primaryImageTag !== undefined) {
      credential.primaryImageTag = primaryImageTag;
    }
    if (deviceId !== undefined) {
      // The new token is bound to the id it was requested under; recording
      // anything else would send later requests on the wrong device.
      credential.deviceId = deviceId;
    }
    const key = credentialKey(serverUrl, userId);
    await SecureStore.setItemAsync(key, JSON.stringify(credential));

    // Also update the account info in the server list
    addAccountToServer(
      serverUrl,
      credential.serverName,
      toSavedAccount(credential),
    );
  }
}

// Legacy functions for backward compatibility during transition
// These delegate to new functions

/**
 * @deprecated Use saveAccountCredential instead
 */
export async function saveServerCredential(
  credential: ServerCredential,
): Promise<void> {
  return saveAccountCredential(credential);
}

/**
 * @deprecated Use getAccountCredential instead
 */
export async function getServerCredential(
  serverUrl: string,
): Promise<ServerCredential | null> {
  // Try to get first account's credential for backward compatibility
  const servers = getPreviousServers();
  const server = servers.find((s) => s.address === serverUrl);
  if (server && server.accounts.length > 0) {
    return getAccountCredential(serverUrl, server.accounts[0].userId);
  }
  return null;
}

/**
 * @deprecated Use deleteAccountCredential instead
 */
export async function deleteServerCredential(serverUrl: string): Promise<void> {
  // Delete first account for backward compatibility
  const servers = getPreviousServers();
  const server = servers.find((s) => s.address === serverUrl);
  if (server && server.accounts.length > 0) {
    return deleteAccountCredential(serverUrl, server.accounts[0].userId);
  }
}

/**
 * @deprecated Use hasAccountCredential instead
 */
export async function hasServerCredential(serverUrl: string): Promise<boolean> {
  const servers = getPreviousServers();
  const server = servers.find((s) => s.address === serverUrl);
  return server ? server.accounts.length > 0 : false;
}

/**
 * @deprecated Use migrateToMultiAccount instead
 */
export async function migrateServersList(): Promise<void> {
  return migrateToMultiAccount();
}

/**
 * @deprecated Use saveAccountCredential instead
 */
export async function migrateCurrentSessionToSecureStorage(
  serverUrl: string,
  token: string,
  userId: string,
  username: string,
  serverName?: string,
): Promise<void> {
  const existingCredential = await getAccountCredential(serverUrl, userId);

  // Only save if not already saved
  if (!existingCredential) {
    await saveAccountCredential({
      serverUrl,
      serverName: serverName || "",
      token,
      userId,
      username,
      savedAt: Date.now(),
      securityType: "none",
    });
  }
}
