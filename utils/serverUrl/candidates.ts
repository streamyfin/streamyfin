/**
 * Generic server-URL candidate generator.
 *
 * Turns loose user input (`media.uruk.dev`, `https://media.uruk.dev`,
 * `host:8096`, `http://10.0.0.5:3000/path`) into an ordered list of full URLs
 * to probe — https first, http as fallback — while preserving any explicit
 * port and path. Service-agnostic: unlike the Jellyfin SDK's `getAddressCandidates`
 * it adds no Jellyfin-specific ports, so it suits Jellyseerr/Streamystats/etc.
 */

// scheme? host (port)? (path/query/hash)?
const URL_RE = /^(?:(https?):\/\/)?([^/:\s?#]+)(?::(\d+))?([/?#].*)?$/i;

export interface ParsedServerInput {
  scheme?: "http" | "https";
  host: string;
  port?: string;
  /** Normalized path+query+hash, without a trailing slash; "" when none. */
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
 * - Explicit scheme AND port → trusted as-is (single candidate).
 * - Otherwise https is tried before http (prefer secure), keeping any port/path.
 *
 * @returns [] when the input can't be parsed.
 */
export function getServerUrlCandidates(input: string): string[] {
  const parsed = parseServerInput(input);
  if (!parsed) return [];

  const { scheme, host, port, path } = parsed;

  // Fully specified: don't second-guess the user.
  if (scheme && port) return [buildUrl(scheme, host, port, path)];

  // Secure-first; the typed scheme (if any) is still covered by this set.
  const candidates = (["https", "http"] as const).map((s) =>
    buildUrl(s, host, port, path),
  );
  return Array.from(new Set(candidates));
}
