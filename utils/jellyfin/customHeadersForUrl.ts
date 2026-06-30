import { getCustomHeaders } from "@/utils/jellyfin/jellyfin";
import { isUrlForBaseUrl } from "@/utils/urlMatching";

export function getJellyfinCustomHeadersForUrl(
  url: string | null | undefined,
  serverUrl: string | null | undefined,
): Record<string, string> | undefined {
  if (!url || !serverUrl || !isUrlForBaseUrl(url, serverUrl)) {
    return undefined;
  }

  const headers = getCustomHeaders(serverUrl);
  return Object.keys(headers).length > 0 ? headers : undefined;
}
