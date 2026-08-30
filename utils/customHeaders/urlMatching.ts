/** Adds https:// to a bare host so it can be parsed as a URL. */
function withHttpProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Canonical form of a configured base URL: protocol present, no trailing slash. */
export function normalizeHttpBaseUrl(url: string): string {
  return withHttpProtocol(url).replace(/\/+$/, "");
}

/**
 * Whether `url` is served by `baseUrl` — same origin, and below the base path
 * when the base URL has one (a reverse proxy may host Jellyfin under /jellyfin).
 *
 * Custom headers are only attached to URLs that match a configured base, so a
 * poster hosted on TMDB never receives the proxy credentials.
 */
export function isUrlForBaseUrl(url: string, baseUrl: string): boolean {
  if (!url || !baseUrl.trim()) return false;

  const normalizedBase = normalizeHttpBaseUrl(baseUrl);

  // Every image in the app runs this, and almost all of them are the server's
  // own URL with a path appended — which is decidable without parsing. Anything
  // else (a default port spelled out, a different case, a dot segment that
  // could climb out of the base path) still goes through the full comparison.
  if (
    url.length > normalizedBase.length &&
    url.startsWith(`${normalizedBase}/`) &&
    !url.includes("..")
  ) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    const parsedBase = new URL(normalizedBase);
    const basePath = parsedBase.pathname.replace(/\/$/, "");

    return (
      parsedUrl.origin === parsedBase.origin &&
      (basePath === "" ||
        parsedUrl.pathname === basePath ||
        parsedUrl.pathname.startsWith(`${basePath}/`))
    );
  } catch {
    return false;
  }
}
