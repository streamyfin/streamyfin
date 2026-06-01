import type { CustomHeader } from "./secureCredentials";

const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function hasInvalidHeaderValueCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Converts a CustomHeader array (as stored in MMKV) into a plain header map,
 * filtering disabled entries and trimming whitespace from both keys and values.
 * Single source of truth - used by getCustomHeaders, getIntegrationHeaders,
 * and the CustomHeaderSelector preview.
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
      typeof header.value !== "string"
    ) {
      continue;
    }

    const { key, value, enabled } = header;
    const k = key.trim();
    const v = value.trim();
    const normalizedKey = k.toLowerCase();
    if (
      enabled &&
      HEADER_NAME_RE.test(k) &&
      v &&
      !hasInvalidHeaderValueCharacters(v) &&
      !seenKeys.has(normalizedKey)
    ) {
      result[k] = v;
      seenKeys.add(normalizedKey);
    }
  }
  return result;
}
