import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/integrationHeaders";
import { getCustomHeaders } from "@/utils/jellyfin/jellyfin";
import { customHeadersVersionAtom } from "@/utils/secureCredentials";
import { isUrlForBaseUrl } from "@/utils/urlMatching";

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

    // Check Jellyseerr first so subpath deployments do not inherit Jellyfin headers.
    const seerrUrl = settings?.jellyseerrServerUrl;
    if (seerrUrl) {
      if (isUrlForBaseUrl(uri, seerrUrl)) {
        const h = getIntegrationHeaders("jellyseerr");
        return Object.keys(h).length > 0 ? h : undefined;
      }
    }

    // Jellyfin server
    if (api?.basePath) {
      if (isUrlForBaseUrl(uri, api.basePath)) {
        const h = getCustomHeaders(api.basePath);
        return Object.keys(h).length > 0 ? h : undefined;
      }
    }

    // External URL - no custom headers
    return undefined;
  }, [uri, api?.basePath, settings?.jellyseerrServerUrl, customHeadersVersion]);
}
