import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/integrationHeaders";
import { getCustomHeaders } from "@/utils/jellyfin/jellyfin";
import { customHeadersVersionAtom } from "@/utils/secureCredentials";
import { isUrlForBaseUrl, normalizeHttpBaseUrl } from "@/utils/urlMatching";

/**
 * Returns the correct HTTP headers for a given image URI based on which
 * server it belongs to:
 *   - Jellyfin server URL: CF / custom headers configured for Jellyfin
 *   - Jellyseerr server URL: headers configured for the jellyseerr integration
 *   - External URL (TMDB, etc.): undefined (no headers injected)
 */
export function useHeadersForUrl(
  uri?: string | null,
): Record<string, string> | undefined {
  const api = useAtomValue(apiAtom);
  const customHeadersVersion = useAtomValue(customHeadersVersionAtom);
  const { settings } = useSettings();

  return useMemo(() => {
    if (!uri) return undefined;

    const matches = [
      settings?.jellyseerrServerUrl
        ? {
            baseUrl: settings.jellyseerrServerUrl,
            getHeaders: () => getIntegrationHeaders("jellyseerr"),
            priority: 1,
          }
        : null,
      api?.basePath
        ? {
            baseUrl: api.basePath,
            getHeaders: () => getCustomHeaders(api.basePath),
            priority: 0,
          }
        : null,
    ]
      .filter((match): match is NonNullable<typeof match> => match !== null)
      .filter((match) => isUrlForBaseUrl(uri, match.baseUrl))
      .sort((a, b) => {
        const specificity =
          normalizeHttpBaseUrl(b.baseUrl).length -
          normalizeHttpBaseUrl(a.baseUrl).length;
        return specificity || b.priority - a.priority;
      });

    for (const match of matches) {
      const h = match.getHeaders();
      if (h && Object.keys(h).length > 0) return h;
    }

    // External URL - no custom headers
    return undefined;
  }, [uri, api?.basePath, settings?.jellyseerrServerUrl, customHeadersVersion]);
}
