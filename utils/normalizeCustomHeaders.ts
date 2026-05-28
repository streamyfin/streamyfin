import type { CustomHeader } from "./secureCredentials";

/**
 * Converts a CustomHeader array (as stored in MMKV) into a plain header map,
 * filtering disabled entries and trimming whitespace from both keys and values.
 * Single source of truth — used by getCustomHeaders, getIntegrationHeaders,
 * and the CustomHeaderSelector preview.
 */
export function normalizeCustomHeaders(
  headers: CustomHeader[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, value, enabled } of headers) {
    const k = key.trim();
    if (enabled && k) {
      result[k] = value.trim();
    }
  }
  return result;
}
