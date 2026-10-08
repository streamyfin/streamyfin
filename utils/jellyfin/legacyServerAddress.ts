import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import { JELLYFIN_PRODUCT_NAME } from "@/constants/Jellyfin";
import {
  normalizeCustomHeaders,
  optionsWithOptionalHeaders,
} from "@/utils/customHeaders";
import {
  checkJellyfinServer,
  PROBE_TIMEOUT_MS,
} from "@/utils/jellyfin/checkServer";
import { writeInfoLog, writeToLog } from "@/utils/log";
import {
  getServerCustomHeaders,
  renameSavedServer,
} from "@/utils/secureCredentials";
import { stripLegacyRoutePrefix } from "@/utils/serverUrl/legacyRoutePrefix";

/**
 * Whether a server address ends in one of the route aliases Jellyfin 12
 * removed (`/emby`, `/mediabrowser`). They are Jellyfin's own, kept from its
 * Emby days: an address saved with one reaches a Jellyfin server up to 10.11
 * and nothing at all from 12 on.
 */
export const hasLegacyRoutePrefix = (serverUrl: string): boolean =>
  stripLegacyRoutePrefix(serverUrl) !== serverUrl;

/**
 * The id of the Jellyfin server answering at `serverUrl`, or null when none
 * does: nothing answers, something else does, or it gives no id.
 */
const probeServerId = async (
  serverUrl: string,
  timeoutMs: number,
): Promise<string | null> => {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${serverUrl}/System/Info/Public`,
      optionsWithOptionalHeaders(
        { mode: "cors" as const, signal: abort.signal },
        normalizeCustomHeaders(getServerCustomHeaders(serverUrl)),
      ),
    );
    if (!response.ok) return null;
    const data = (await response.json()) as PublicSystemInfo;
    return data.ProductName === JELLYFIN_PRODUCT_NAME
      ? (data.Id ?? null)
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

// One migration per address at a time: the launch and a quick login can both
// ask for the same one, and two runs would interleave their keychain writes.
const running = new Map<string, Promise<string | null>>();

const migrate = async (
  serverUrl: string,
  timeoutMs: number,
): Promise<string | null> => {
  try {
    // Tries the root first and falls back to the address as saved, with the
    // custom headers saved for it.
    const reached = await checkJellyfinServer(serverUrl, undefined, timeoutMs);
    // Nothing answers (offline, most likely), or only the address as saved
    // does: a proxy that forwards the prefixed path and nothing else.
    if (!reached || hasLegacyRoutePrefix(reached.url)) return null;

    // The root is a Jellyfin server. It is the same one unless the address
    // as saved still answers and says otherwise: a proxy can put two servers
    // on one host, and the accounts must not be moved onto the wrong one. On
    // Jellyfin 12 the saved address no longer answers, and there is nothing
    // left there to compare with, or to lose.
    const savedId = await probeServerId(serverUrl, timeoutMs);
    if (savedId && reached.id && savedId !== reached.id) {
      writeToLog(
        "WARN",
        "Server address migration: the root is another server, left alone",
      );
      return null;
    }

    await renameSavedServer(serverUrl, reached.url);
    writeInfoLog(
      "Server address migration: moved off the legacy route prefix",
      { from: serverUrl, to: reached.url },
    );
    return reached.url;
  } catch (error) {
    // A server too old to support, or a keychain that refused: the saved
    // address stays, and the next launch tries again.
    writeToLog("WARN", "Server address migration failed", {
      error: error instanceof Error ? `${error.name}: ${error.message}` : "",
    });
    return null;
  }
};

/**
 * Moves a server saved under `/emby` or `/mediabrowser` to its root address,
 * once that root is known to be the same Jellyfin server: accounts,
 * credentials, custom headers and local network setup all move with it.
 *
 * Resolves to the new address, or to null when nothing moved: the address
 * has no such prefix, the server could not be reached, or the root is not
 * that server. Never rejects, and asking again is safe.
 */
export const migrateLegacyServerAddress = (
  serverUrl: string,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<string | null> => {
  if (!hasLegacyRoutePrefix(serverUrl)) return Promise.resolve(null);

  const ongoing = running.get(serverUrl);
  if (ongoing) return ongoing;

  const migration = migrate(serverUrl, timeoutMs).finally(() => {
    running.delete(serverUrl);
  });
  running.set(serverUrl, migration);
  return migration;
};
