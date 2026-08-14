/**
 * Helpers for call sites that must not grow a `headers` property when no custom
 * headers are configured — several native APIs (expo-image, expo-file-system,
 * react-native-track-player) behave differently once the key exists, so the
 * unconfigured path has to stay byte-for-byte what it was before this feature.
 */

export function hasHeaders(
  headers?: Record<string, string> | null,
): headers is Record<string, string> {
  return !!headers && Object.keys(headers).length > 0;
}

/** `{ uri }` unless there are headers to attach. */
export function sourceWithOptionalHeaders(
  uri: string,
  headers?: Record<string, string> | null,
): { uri: string; headers?: Record<string, string> } {
  return hasHeaders(headers) ? { uri, headers } : { uri };
}

/** Returns `options` untouched unless there are headers to merge in. */
export function optionsWithOptionalHeaders<T extends object>(
  options: T,
  headers?: Record<string, string> | null,
): T & { headers?: Record<string, string> } {
  if (!hasHeaders(headers)) return options;

  const existingHeaders = (options as { headers?: Record<string, string> })
    .headers;

  return {
    ...options,
    headers: { ...(existingHeaders ?? {}), ...headers },
  };
}
