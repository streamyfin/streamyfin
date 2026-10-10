import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useServerVersion } from "@/hooks/useServerVersion";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getAuthHeaders } from "@/utils/jellyfin/jellyfin";
import { supportsItemCollections } from "@/utils/jellyfin/serverVersion";

/**
 * The collections (BoxSets) that contain an item, for the "Collections" row of
 * the details page. Asks nothing, and so has no data, until the server is
 * known to be Jellyfin 12 or newer: the endpoint does not exist before that
 * and answers 404.
 */
export const useItemCollections = (
  itemId: string | null | undefined,
  enabled = true,
) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const serverVersion = useServerVersion({ enabled });

  return useQuery<BaseItemDto[]>({
    // Deliberately not under ["item", itemId]: the favorite and played
    // toggles rewrite everything below that prefix as if it were the item
    // itself, which turns a cached list into a plain object.
    // The user is part of it: which collections come back depends on what
    // that user may see.
    queryKey: ["itemCollections", itemId, user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id || !itemId) return [];

      // `getLibraryApi(api).getItemCollections` once the SDK is on 1.0.0;
      // 0.13 does not know the endpoint.
      const response = await api.axiosInstance.get<BaseItemDtoQueryResult>(
        `${api.basePath}/Items/${itemId}/Collections`,
        {
          params: {
            userId: user.Id,
            fields: "PrimaryImageAspectRatio" satisfies ItemFields,
          },
          headers: getAuthHeaders(api),
        },
      );

      return response.data.Items ?? [];
    },
    enabled:
      !!api &&
      !!user?.Id &&
      !!itemId &&
      enabled &&
      supportsItemCollections(serverVersion),
  });
};
