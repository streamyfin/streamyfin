/**
 * Generic server-URL candidate generator.
 *
 * Turns loose user input (`media.uruk.dev`, `https://media.uruk.dev`,
 * `host:8096`, `http://10.0.0.5:3000/path`) into an ordered list of full URLs
 * to probe — https first, http as fallback — while preserving any explicit
 * port and path. Service-agnostic: unlike the Jellyfin SDK's `getAddressCandidates`
 * it adds no Jellyfin-specific ports, so it suits Seerr/Streamystats/etc.
 */

// scheme? host (port)? path? -- query/fragment are matched but discarded:
// they are meaningless in a server base URL and would corrupt the endpoint
// paths the probes append.
const URL_RE =
  /^(?:(https?):\/\/)?([^/:\s?#]+)(?::(\d+))?(\/[^?#]*)?(?:[?#].*)?$/i;

export interface ParsedServerInput {
  scheme?: "http" | "https";
  host: string;
  port?: string;
  /** Normalized pathname, without a trailing slash; "" when none. */
  path: string;
}

function normalizePath(path?: string): string {
  if (!path || path === "/") return "";
  return path.replace(/\/+$/, "");
}

/** Parse loose user input. Returns null when it can't be understood. */
export function parseServerInput(input: string): ParsedServerInput | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = URL_RE.exec(trimmed);
  if (!match) return null;

  const [, scheme, host, port, rawPath] = match;
  return {
    scheme: scheme ? (scheme.toLowerCase() as "http" | "https") : undefined,
    host: host.toLowerCase(),
    port,
    path: normalizePath(rawPath),
  };
}

function buildUrl(
  scheme: "http" | "https",
  host: string,
  port: string | undefined,
  path: string,
): string {
  return `${scheme}://${host}${port ? `:${port}` : ""}${path}`;
}

/**
 * Ordered, de-duplicated candidate URLs for the given input.
 *
 * - Explicit scheme → trusted as-is (single candidate): never upgrade a typed
 *   `http://` to https (anything answering on 443 would hijack the choice) nor
 *   silently downgrade a typed `https://` to plain http.
 * - Otherwise https is tried before http (prefer secure), keeping any port/path.
 *
 * @returns [] when the input can't be parsed.
 */
export function getServerUrlCandidates(input: string): string[] {
  const parsed = parseServerInput(input);
  if (!parsed) return [];

  const { scheme, host, port, path } = parsed;

  // The user chose a scheme: don't second-guess it.
  if (scheme) return [buildUrl(scheme, host, port, path)];

  const candidates = (["https", "http"] as const).map((s) =>
    buildUrl(s, host, port, path),
  );
  return Array.from(new Set(candidates));
}

/**
 * Whether `url` can serve as a server base as it stands: it parses, and as
 * http(s).
 *
 * The scheme is checked rather than trusted to `new URL` throwing, because a
 * bare `localhost:8096` does parse — with `localhost:` as its scheme.
 */
export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The one URL an address stands for when no server answered to settle it: the
 * canonical form of an address typed with its scheme, the same one resolution
 * would have adopted.
 *
 * @returns null when the scheme was left out (https or http, only a probe can
 * tell, and a guess would be stored as if it were known) or when the input is
 * not an address.
 */
export function getExplicitServerUrl(input: string): string | null {
  if (!parseServerInput(input)?.scheme) return null;

  const [url] = getServerUrlCandidates(input);
  return isHttpUrl(url) ? url : null;
}
