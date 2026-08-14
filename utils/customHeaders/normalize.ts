import type { CustomHeader } from "./types";

/** RFC 7230 token characters — anything else is not a legal header name. */
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Headers the app sets itself. A custom header of the same name would replace
 * the Jellyfin session token (or a service's own token) and log the user out,
 * so it is dropped instead of sent. `X-Emby-*` are the aliases Jellyfin still
 * accepts for the same credentials.
 */
const RESERVED_HEADER_NAMES = new Set([
  "authorization",
  "x-emby-authorization",
  "x-emby-token",
]);

/** Control characters in a value would let a stored value inject extra headers. */
function hasInvalidHeaderValueCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Converts stored header entries into a plain header map, dropping everything
 * that must never reach a request: disabled, blank, malformed, or duplicated
 * (case-insensitively) entries. The single source of truth for every call site
 * that turns configuration into request headers.
 */
export function normalizeCustomHeaders(
  headers?: CustomHeader[] | null,
): Record<string, string> {
  const result: Record<string, string> = {};
  const seenKeys = new Set<string>();

  for (const header of headers ?? []) {
    if (
      !header ||
      typeof header.key !== "string" ||
      typeof header.value !== "string" ||
      !header.enabled
    ) {
      continue;
    }

    const key = header.key.trim();
    const value = header.value.trim();
    const normalizedKey = key.toLowerCase();

    if (
      HEADER_NAME_RE.test(key) &&
      value &&
      !hasInvalidHeaderValueCharacters(value) &&
      !RESERVED_HEADER_NAMES.has(normalizedKey) &&
      !seenKeys.has(normalizedKey)
    ) {
      result[key] = value;
      seenKeys.add(normalizedKey);
    }
  }

  return result;
}

/**
 * The stored rows that survive `normalizeCustomHeaders`, in row form. Used
 * where rows are persisted rather than sent — a preset that was added but only
 * half filled in must not reach storage, where it would sit as a dead row and
 * hold a SecureStore key for an empty secret.
 */
export function usableCustomHeaders(
  headers?: CustomHeader[] | null,
): CustomHeader[] {
  const usableKeys = new Set(Object.keys(normalizeCustomHeaders(headers)));

  return (headers ?? []).filter((header) => {
    const key = header?.key?.trim();
    if (!key || !usableKeys.has(key)) return false;
    // Only the first row of a duplicated name is the one that is sent.
    usableKeys.delete(key);
    return true;
  });
}
