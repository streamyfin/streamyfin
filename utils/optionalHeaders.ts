export function hasHeaders(
  headers?: Record<string, string> | null,
): headers is Record<string, string> {
  return !!headers && Object.keys(headers).length > 0;
}

export function sourceWithOptionalHeaders(
  uri: string,
  headers?: Record<string, string> | null,
): { uri: string; headers?: Record<string, string> } {
  return hasHeaders(headers) ? { uri, headers } : { uri };
}

export function optionsWithOptionalHeaders<T extends object>(
  options: T,
  headers?: Record<string, string> | null,
): T & { headers?: Record<string, string> } {
  return hasHeaders(headers) ? { ...options, headers } : options;
}
