import { storage } from "@/utils/mmkv";
import {
  getPreviousServers,
  getServerCustomHeaders,
} from "@/utils/secureCredentials";
import { store } from "@/utils/store";
import {
  getIntegrationHeaderConfig,
  resolveIntegrationHeaders,
} from "./integrations";
import { normalizeCustomHeaders } from "./normalize";
import { customHeadersVersionAtom, trackSecureReads } from "./secureValues";
import type { IntegrationKey } from "./types";
import { isUrlForBaseUrl, normalizeHttpBaseUrl } from "./urlMatching";

/**
 * Resolving headers parses the saved-server list and reads SecureStore (a
 * synchronous Keychain call) once per header. Every image in the app asks for
 * them, so the answers are memoized until the configuration changes — that is
 * exactly what `customHeadersVersionAtom` counts.
 */
const serverHeaderCache = new Map<string, Record<string, string>>();
const integrationHeaderCache = new Map<string, Record<string, string>>();
let cachedServerAddresses: string[] | null = null;
let cachedVersion: number | null = null;

function withFreshCaches<T>(read: () => T): T {
  const version = store.get(customHeadersVersionAtom);
  if (version !== cachedVersion) {
    serverHeaderCache.clear();
    integrationHeaderCache.clear();
    cachedServerAddresses = null;
    cachedVersion = version;
  }
  return read();
}

/**
 * What a resolver answers when a value behind the headers could not be read:
 * iOS launched the app in the background on a locked phone, and the Keychain
 * hands nothing out until it is unlocked.
 *
 * It is empty, so anything that renders with it attaches nothing. All of the
 * headers are withheld even when only one value failed: half of a gateway's
 * credentials open nothing.
 */
const UNREADABLE_HEADERS: Record<string, string> = Object.freeze({});

/**
 * Whether `headers` stand for values that could not be read, rather than for
 * a service with no headers configured.
 *
 * A client that takes a refusal as the end of the session has to ask before
 * it sends anything: without its headers a request is turned away by the
 * user's gateway, not by the server behind it. It only holds for the object a
 * resolver returned, not for a copy of it.
 */
export function headersUnreadable(headers: Record<string, string>): boolean {
  return headers === UNREADABLE_HEADERS;
}

/**
 * Remembers what `resolve` answers, unless a value was unreadable. The cache
 * lasts until the configuration changes and unlocking the phone changes none
 * of it, so a remembered failure would outlive its cause.
 */
function resolveOnce(
  cache: Map<string, Record<string, string>>,
  key: string,
  resolve: () => Record<string, string>,
): Record<string, string> {
  const cached = cache.get(key);
  if (cached) return cached;

  const { value, complete } = trackSecureReads(resolve);
  if (!complete) return UNREADABLE_HEADERS;

  cache.set(key, value);
  return value;
}

/** Headers configured for a Jellyfin server, ready to put on a request. */
export function getJellyfinHeaders(
  serverUrl?: string | null,
): Record<string, string> {
  if (!serverUrl) return {};

  return withFreshCaches(() =>
    resolveOnce(serverHeaderCache, serverUrl, () =>
      normalizeCustomHeaders(getServerCustomHeaders(serverUrl)),
    ),
  );
}

/**
 * Effective headers for a self-hosted integration, resolving the "use the
 * Jellyfin headers" option against the currently connected server.
 */
export function getIntegrationHeaders(
  integrationKey: IntegrationKey,
): Record<string, string> {
  return withFreshCaches(() => {
    // Keyed on the connected server too: a "use the Jellyfin headers"
    // integration resolves against it, and switching servers doesn't touch the
    // header configuration — so nothing else would invalidate this entry.
    const serverUrl = storage.getString("serverUrl");
    const cacheKey = `${integrationKey}\u0000${serverUrl ?? ""}`;

    return resolveOnce(integrationHeaderCache, cacheKey, () =>
      resolveIntegrationHeaders(
        getIntegrationHeaderConfig(integrationKey),
        () => getJellyfinHeaders(serverUrl),
      ),
    );
  });
}

/**
 * Headers for `url`, but only when it is actually served by the Jellyfin
 * server — an item can carry a poster or stream hosted somewhere else, and
 * those must never receive the proxy credentials.
 *
 * Returns `undefined` (not `{}`) when nothing applies, so call sites can leave
 * their request options untouched.
 */
export function getJellyfinHeadersForUrl(
  url: string | null | undefined,
  serverUrl: string | null | undefined,
): Record<string, string> | undefined {
  if (!url || !serverUrl || !isUrlForBaseUrl(url, serverUrl)) return undefined;

  const headers = getJellyfinHeaders(serverUrl);
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Headers for a URL served by any *saved* server. Covers the screens that show
 * server images before a session exists (account pickers, server selection),
 * where there is no connected server to match against.
 */
function getSavedServerHeadersForUrl(
  url: string,
): Record<string, string> | undefined {
  return withFreshCaches(() => {
    // The whole point of this path is URLs that match nothing (TMDB artwork and
    // friends), so the address list is cached too rather than re-parsed per image.
    cachedServerAddresses ??= getPreviousServers().map(
      (server) => server.address,
    );

    const address = cachedServerAddresses.find((candidate) =>
      isUrlForBaseUrl(url, candidate),
    );
    if (!address) return undefined;

    const headers = getJellyfinHeaders(address);
    return Object.keys(headers).length > 0 ? headers : undefined;
  });
}

interface HeadersForUrlOptions {
  jellyfinBaseUrl?: string | null;
  seerrBaseUrl?: string | null;
}

/**
 * Picks the headers for an arbitrary URL by matching it against the configured
 * services. Used for images, which can point at Jellyfin, at Seerr, or at
 * a public host such as TMDB (no headers).
 *
 * Only the most specific match answers: an integration set to "none" sends
 * nothing even when it lives under the Jellyfin host.
 */
export function getHeadersForUrl(
  url: string | null | undefined,
  { jellyfinBaseUrl, seerrBaseUrl }: HeadersForUrlOptions,
): Record<string, string> | undefined {
  if (!url) return undefined;

  const match = [
    jellyfinBaseUrl
      ? {
          baseUrl: jellyfinBaseUrl,
          getHeaders: () => getJellyfinHeaders(jellyfinBaseUrl),
        }
      : null,
    seerrBaseUrl
      ? {
          baseUrl: seerrBaseUrl,
          getHeaders: () => getIntegrationHeaders("seerr"),
        }
      : null,
  ]
    .filter((candidate) => candidate !== null)
    .filter((candidate) => isUrlForBaseUrl(url, candidate.baseUrl))
    .sort(
      (a, b) =>
        normalizeHttpBaseUrl(b.baseUrl).length -
        normalizeHttpBaseUrl(a.baseUrl).length,
    )[0];

  if (match) {
    const headers = match.getHeaders();
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  return getSavedServerHeadersForUrl(url);
}
