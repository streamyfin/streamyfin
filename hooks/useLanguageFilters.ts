import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useServerVersion } from "@/hooks/useServerVersion";
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

  const serverVersion = useServerVersion();

  const libraryId = library?.Id;
  const itemTypes = getLanguageFilterItemTypes(library);
  const enabled = supportsLanguageFilters(serverVersion) && !!itemTypes;

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
