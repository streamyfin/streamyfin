import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  ItemSortBy,
  SortOrder,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getChannelsApi } from "@jellyfin/sdk/lib/utils/api";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";

/**
 * Hook to fetch all available channels
 */
export const useChannels = () => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { offlineMode } = useOfflineLibrary();

  return useQuery({
    queryKey: ["channels", user?.Id, offlineMode ? "offline" : "online"],
    queryFn: async () => {
      if (!api || !user?.Id) return null;

      const response = await getChannelsApi(api).getChannels({
        userId: user.Id,
      });

      return response.data.Items || [];
    },
    enabled: !offlineMode && !!api && !!user?.Id,
    networkMode: offlineMode ? "offlineFirst" : "online",
    staleTime: 60 * 1000,
  });
};

/**
 * Hook to fetch a single channel by ID
 */
export const useChannel = (channelId: string | undefined) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  return useQuery({
    queryKey: ["channel", channelId],
    queryFn: async () => {
      if (!api || !user?.Id || !channelId) return null;

      const response = await getChannelsApi(api).getChannels({
        userId: user.Id,
      });

      return response.data.Items?.find((c) => c.Id === channelId) || null;
    },
    enabled: !!api && !!user?.Id && !!channelId,
    staleTime: 60 * 1000,
  });
};

interface UseChannelItemsOptions {
  channelId: string | undefined;
  folderId?: string | undefined;
  sortBy?: ItemSortBy[];
  sortOrder?: SortOrder[];
}

/**
 * Hook to fetch items within a channel or channel folder with infinite scrolling
 */
export const useChannelItems = ({
  channelId,
  folderId,
  sortBy,
  sortOrder,
}: UseChannelItemsOptions) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const fetchItems = useCallback(
    async ({
      pageParam,
    }: {
      pageParam: number;
    }): Promise<BaseItemDtoQueryResult | null> => {
      if (!api || !channelId) return null;

      const response = await getChannelsApi(api).getChannelItems({
        channelId,
        folderId,
        userId: user?.Id,
        startIndex: pageParam,
        limit: 36,
        sortBy,
        sortOrder,
        fields: ["PrimaryImageAspectRatio", "SortName", "MediaSources"],
      });

      return response.data || null;
    },
    [api, user?.Id, channelId, folderId, sortBy, sortOrder],
  );

  return useInfiniteQuery({
    queryKey: ["channel-items", channelId, folderId, sortBy, sortOrder],
    queryFn: fetchItems,
    getNextPageParam: (lastPage, pages) => {
      if (
        !lastPage?.Items ||
        !lastPage?.TotalRecordCount ||
        lastPage?.TotalRecordCount === 0
      )
        return undefined;

      const totalItems = lastPage.TotalRecordCount;
      const accumulatedItems = pages.reduce(
        (acc, curr) => acc + (curr?.Items?.length || 0),
        0,
      );

      if (accumulatedItems < totalItems) {
        return lastPage?.Items?.length * pages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!api && !!user?.Id && !!channelId,
  });
};

/**
 * Flatten channel items from paginated response
 */
export const flattenChannelItems = (
  data: ReturnType<typeof useChannelItems>["data"],
): BaseItemDto[] => {
  return (
    (data?.pages.flatMap((p) => p?.Items).filter(Boolean) as BaseItemDto[]) ||
    []
  );
};
