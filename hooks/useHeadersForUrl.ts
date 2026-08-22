import { useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { useMemo } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import {
  customHeadersVersionAtom,
  getHeadersForUrl,
} from "@/utils/customHeaders";

// Every image in the app runs this hook, so it subscribes to the one setting it
// needs rather than to all of them through useSettings().
const jellyseerrServerUrlAtom = selectAtom(
  effectiveSettingsAtom,
  (settings) => settings.jellyseerrServerUrl,
);

/**
 * Custom proxy auth headers for a URL, picked by the server it belongs to:
 * the Jellyfin server, the Jellyseerr server, or nothing at all for a public
 * host such as TMDB.
 *
 * Returns `undefined` when no headers apply, so a source can be left untouched.
 */
export function useHeadersForUrl(
  uri?: string | null,
): Record<string, string> | undefined {
  const api = useAtomValue(apiAtom);
  const jellyseerrServerUrl = useAtomValue(jellyseerrServerUrlAtom);
  const customHeadersVersion = useAtomValue(customHeadersVersionAtom);

  return useMemo(
    () =>
      getHeadersForUrl(uri, {
        jellyfinBaseUrl: api?.basePath,
        jellyseerrBaseUrl: jellyseerrServerUrl,
      }),
    // customHeadersVersion: re-resolve after the configuration changes.
    [uri, api?.basePath, jellyseerrServerUrl, customHeadersVersion],
  );
}
