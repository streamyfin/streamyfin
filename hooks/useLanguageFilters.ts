import type {
  BaseItemDto,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { SERVER_INFO_STALE_TIME_MS } from "@/constants/Jellyfin";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  fetchLanguageFilters,
  getLanguageFilterItemTypes,
  NO_LANGUAGE_FILTERS,
} from "@/utils/jellyfin/languageFilters";
import { supportsLanguageFilters } from "@/utils/jellyfin/serverVersion";

/**
 * The audio and subtitle languages a library can be filtered by.
 *
 * `enabled` is false, and Filters2 is never asked, on a server older than
 * Jellyfin 12 and on a library the filters do not apply to. One request feeds
 * both filters on mobile and on TV.
 */
export const useLanguageFilters = (library: BaseItemDto | null | undefined) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  // Same key, shape and nullable contract as the other consumers of the server
  // info (useMediaPreferences, useJellyfinServerId).
  const { data: serverInfo } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api,
    staleTime: SERVER_INFO_STALE_TIME_MS,
  });

  const libraryId = library?.Id;
  const itemTypes = getLanguageFilterItemTypes(library);
  const enabled = supportsLanguageFilters(serverInfo?.Version) && !!itemTypes;

  const { data } = useQuery({
    queryKey: ["filters", "languages", libraryId, itemTypes],
    queryFn: async () => {
      if (!api || !libraryId || !itemTypes) return NO_LANGUAGE_FILTERS;
      return fetchLanguageFilters(api, {
        userId: user?.Id,
        parentId: libraryId,
        includeItemTypes: itemTypes,
      });
    },
    enabled: enabled && !!api && !!user?.Id && !!libraryId,
  });

  return { enabled, ...(data ?? NO_LANGUAGE_FILTERS) };
};
