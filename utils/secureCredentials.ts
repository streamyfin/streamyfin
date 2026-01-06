import * as SecureStore from "expo-secure-store";
import { storage } from "./mmkv";

const CREDENTIAL_KEY_PREFIX = "credential_";

export interface ServerCredential {
  serverUrl: string;
  serverName: string;
  token: string;
  userId: string;
  username: string;
  savedAt: number;
}

export interface SavedServer {
  address: string;
  name?: string;
  hasCredentials?: boolean;
  username?: string;
}

/**
 * Encode server URL to valid secure store key.
 * Secure store keys must be alphanumeric with underscores.
 */
export function serverUrlToKey(serverUrl: string): string {
  // Use base64 encoding, replace non-alphanumeric chars with underscores
  const encoded = btoa(serverUrl).replace(/[^a-zA-Z0-9]/g, "_");
  return `${CREDENTIAL_KEY_PREFIX}${encoded}`;
}

/**
 * Save credentials for a server to secure storage.
 */
export async function saveServerCredential(
  credential: ServerCredential,
): Promise<void> {
  const key = serverUrlToKey(credential.serverUrl);
  await SecureStore.setItemAsync(key, JSON.stringify(credential));

  // Update previousServers to mark this server as having credentials
  updatePreviousServerCredentialFlag(
    credential.serverUrl,
    true,
    credential.username,
    credential.serverName,
  );
}

/**
 * Retrieve credentials for a server from secure storage.
 */
export async function getServerCredential(
  serverUrl: string,
): Promise<ServerCredential | null> {
  const key = serverUrlToKey(serverUrl);
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
 * Delete credentials for a server from secure storage.
 */
export async function deleteServerCredential(serverUrl: string): Promise<void> {
  const key = serverUrlToKey(serverUrl);
  await SecureStore.deleteItemAsync(key);

  // Update previousServers to mark this server as not having credentials
  updatePreviousServerCredentialFlag(serverUrl, false);
}

/**
 * Check if credentials exist for a server (without retrieving them).
 */
export async function hasServerCredential(serverUrl: string): Promise<boolean> {
  const key = serverUrlToKey(serverUrl);
  const stored = await SecureStore.getItemAsync(key);
  return stored !== null;
}

/**
 * Delete all stored credentials for all servers.
 */
export async function clearAllCredentials(): Promise<void> {
  const previousServers = getPreviousServers();

  for (const server of previousServers) {
    await deleteServerCredential(server.address);
  }
}

/**
 * Helper to update the previousServers list in MMKV with credential status.
 */
function updatePreviousServerCredentialFlag(
  serverUrl: string,
  hasCredentials: boolean,
  username?: string,
  serverName?: string,
): void {
  const previousServers = getPreviousServers();
  const updatedServers = previousServers.map((server) => {
    if (server.address === serverUrl) {
      return {
        ...server,
        hasCredentials,
        username: username || server.username,
        name: serverName || server.name,
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
 * Remove a server from the previous servers list and delete its credentials.
 */
export async function removeServerFromList(serverUrl: string): Promise<void> {
  // First delete any saved credentials
  await deleteServerCredential(serverUrl);
  // Then remove from the list
  const previousServers = getPreviousServers();
  const filtered = previousServers.filter((s) => s.address !== serverUrl);
  storage.set("previousServers", JSON.stringify(filtered));
}

/**
 * Migrate existing previousServers to new format (add hasCredentials: false).
 * Should be called on app startup.
 */
export async function migrateServersList(): Promise<void> {
  const stored = storage.getString("previousServers");
  if (!stored) return;

  try {
    const servers = JSON.parse(stored);
    // Check if migration needed (old format doesn't have hasCredentials)
    if (servers.length > 0 && servers[0].hasCredentials === undefined) {
      const migrated = servers.map((server: SavedServer) => ({
        address: server.address,
        name: server.name,
        hasCredentials: false,
        username: undefined,
      }));
      storage.set("previousServers", JSON.stringify(migrated));
    }
  } catch {
    // If parsing fails, reset to empty array
    storage.set("previousServers", "[]");
  }
}

/**
 * Migrate current session credentials to secure storage.
 * Should be called on app startup for existing users.
 */
export async function migrateCurrentSessionToSecureStorage(
  serverUrl: string,
  token: string,
  userId: string,
  username: string,
  serverName?: string,
): Promise<void> {
  const existingCredential = await getServerCredential(serverUrl);

  // Only save if not already saved
  if (!existingCredential) {
    await saveServerCredential({
      serverUrl,
      serverName: serverName || "",
      token,
      userId,
      username,
      savedAt: Date.now(),
    });
  }
}
