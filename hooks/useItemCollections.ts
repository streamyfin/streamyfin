import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  ItemFields,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { SERVER_INFO_STALE_TIME_MS } from "@/constants/Jellyfin";
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

  // Kept aligned with the other consumers of this key (useMediaPreferences,
  // useJellyfinServerId): same shape, same nullable contract.
  const { data: serverInfo } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api && enabled,
    staleTime: SERVER_INFO_STALE_TIME_MS,
  });

  return useQuery<BaseItemDto[]>({
    // Deliberately not under ["item", itemId]: the favorite and played
    // toggles rewrite everything below that prefix as if it were the item
    // itself, which turns a cached list into a plain object.
    queryKey: ["itemCollections", itemId],
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
      supportsItemCollections(serverInfo?.Version),
  });
};
