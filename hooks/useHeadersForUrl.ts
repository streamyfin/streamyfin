import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/integrationHeaders";
import { getCustomHeaders } from "@/utils/jellyfin/jellyfin";

function normalizeBase(url: string): string {
  if (!url.match(/^https?:\/\//i)) return `https://${url}`;
  return url.replace(/\/$/, "");
}

/**
 * Returns the correct HTTP headers for a given image URI based on which
 * server it belongs to:
 *   - Jellyfin server URL  → CF / custom headers configured for Jellyfin
 *   - Jellyseerr server URL → headers configured for the jellyseerr integration
 *   - External URL (TMDB, etc.) → undefined (no headers injected)
 */
export function useHeadersForUrl(
  uri?: string | null,
): Record<string, string> | undefined {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();

  return useMemo(() => {
    if (!uri) return undefined;

    // Jellyfin server
    if (api?.basePath) {
      const base = normalizeBase(api.basePath);
      if (uri.startsWith(base)) {
        const h = getCustomHeaders(api.basePath);
        return Object.keys(h).length > 0 ? h : undefined;
      }
    }

    // Jellyseerr server
    const seerrUrl = settings?.jellyseerrServerUrl;
    if (seerrUrl) {
      const base = normalizeBase(seerrUrl);
      if (uri.startsWith(base)) {
        const h = getIntegrationHeaders("jellyseerr");
        return Object.keys(h).length > 0 ? h : undefined;
      }
    }

    // External URL — no custom headers
    return undefined;
  }, [uri, api?.basePath, settings?.jellyseerrServerUrl]);
}
