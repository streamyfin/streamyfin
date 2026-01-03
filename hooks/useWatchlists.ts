import type {
  BaseItemDto,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type {
  GetWatchlistItemsParams,
  StreamystatsWatchlist,
} from "@/utils/streamystats/types";

/**
 * Hook to check if Streamystats is configured
 */
export const useStreamystatsEnabled = () => {
  const { settings } = useSettings();
  return useMemo(
    () => Boolean(settings?.streamyStatsServerUrl),
    [settings?.streamyStatsServerUrl],
  );
};

/**
 * Hook to get the Jellyfin server ID needed for Streamystats API calls
 */
export const useJellyfinServerId = () => {
  const api = useAtomValue(apiAtom);
  const streamystatsEnabled = useStreamystatsEnabled();

  const { data: serverInfo, isLoading } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      const response = await getSystemApi(api).getPublicSystemInfo();
      return response.data;
    },
    enabled: Boolean(api) && streamystatsEnabled,
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  return {
    jellyfinServerId: serverInfo?.Id,
    isLoading,
  };
};

/**
 * Hook to get all watchlists (own + public)
 */
export const useWatchlistsQuery = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const streamystatsEnabled = useStreamystatsEnabled();

  return useQuery({
    queryKey: [
      "streamystats",
      "watchlists",
      settings?.streamyStatsServerUrl,
      user?.Id,
    ],
    queryFn: async (): Promise<StreamystatsWatchlist[]> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        return [];
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamystatsApi.getWatchlists();
      return response.data || [];
    },
    enabled: streamystatsEnabled && Boolean(api?.accessToken),
    staleTime: 60 * 1000, // 1 minute
  });
};

/**
 * Hook to get a single watchlist with its items
 */
export const useWatchlistDetailQuery = (
  watchlistId: number | undefined,
  params?: GetWatchlistItemsParams,
) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const streamystatsEnabled = useStreamystatsEnabled();

  return useQuery({
    queryKey: [
      "streamystats",
      "watchlist",
      watchlistId,
      params?.type,
      params?.sort,
      settings?.streamyStatsServerUrl,
    ],
    queryFn: async (): Promise<StreamystatsWatchlist | null> => {
      if (
        !settings?.streamyStatsServerUrl ||
        !api?.accessToken ||
        !watchlistId
      ) {
        return null;
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamystatsApi.getWatchlistDetail(
        watchlistId,
        params,
      );
      return response.data || null;
    },
    enabled:
      streamystatsEnabled &&
      Boolean(api?.accessToken) &&
      Boolean(watchlistId) &&
      Boolean(user?.Id),
    staleTime: 60 * 1000, // 1 minute
  });
};

/**
 * Hook to get watchlist items enriched with Jellyfin item data
 */
export const useWatchlistItemsQuery = (
  watchlistId: number | undefined,
  params?: GetWatchlistItemsParams,
) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const { jellyfinServerId } = useJellyfinServerId();
  const streamystatsEnabled = useStreamystatsEnabled();

  return useQuery({
    queryKey: [
      "streamystats",
      "watchlistItems",
      watchlistId,
      jellyfinServerId,
      params?.type,
      params?.sort,
      settings?.streamyStatsServerUrl,
    ],
    queryFn: async (): Promise<BaseItemDto[]> => {
      if (
        !settings?.streamyStatsServerUrl ||
        !api?.accessToken ||
        !watchlistId ||
        !jellyfinServerId ||
        !user?.Id
      ) {
        return [];
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      // Get watchlist item IDs from Streamystats
      const watchlistDetail = await streamystatsApi.getWatchlistItemIds({
        watchlistId,
        jellyfinServerId,
      });

      const itemIds = watchlistDetail.data?.items;
      if (!itemIds?.length) {
        return [];
      }

      // Fetch full item details from Jellyfin
      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        ids: itemIds,
        fields: [
          "PrimaryImageAspectRatio",
          "Genres",
          "Overview",
          "DateCreated",
        ],
        enableImageTypes: ["Primary", "Backdrop", "Thumb"],
      });

      return response.data.Items || [];
    },
    enabled:
      streamystatsEnabled &&
      Boolean(api?.accessToken) &&
      Boolean(watchlistId) &&
      Boolean(jellyfinServerId) &&
      Boolean(user?.Id),
    staleTime: 60 * 1000, // 1 minute
  });
};

/**
 * Hook to get the user's own watchlists only (for add-to-watchlist picker)
 */
export const useMyWatchlistsQuery = () => {
  const user = useAtomValue(userAtom);
  const { data: allWatchlists, ...rest } = useWatchlistsQuery();

  const myWatchlists = useMemo(() => {
    if (!allWatchlists || !user?.Id) return [];
    return allWatchlists.filter((w) => w.userId === user.Id);
  }, [allWatchlists, user?.Id]);

  return {
    data: myWatchlists,
    ...rest,
  };
};

/**
 * Hook to check which of the user's watchlists contain a specific item
 */
export const useItemInWatchlists = (itemId: string | undefined) => {
  const { data: myWatchlists } = useMyWatchlistsQuery();
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const { jellyfinServerId } = useJellyfinServerId();
  const streamystatsEnabled = useStreamystatsEnabled();

  return useQuery({
    queryKey: [
      "streamystats",
      "itemInWatchlists",
      itemId,
      jellyfinServerId,
      settings?.streamyStatsServerUrl,
    ],
    queryFn: async (): Promise<number[]> => {
      if (
        !settings?.streamyStatsServerUrl ||
        !api?.accessToken ||
        !itemId ||
        !jellyfinServerId ||
        !myWatchlists?.length
      ) {
        return [];
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      // Check each watchlist to see if it contains the item
      const watchlistsContainingItem: number[] = [];

      for (const watchlist of myWatchlists) {
        try {
          const detail = await streamystatsApi.getWatchlistItemIds({
            watchlistId: watchlist.id,
            jellyfinServerId,
          });
          if (detail.data?.items?.includes(itemId)) {
            watchlistsContainingItem.push(watchlist.id);
          }
        } catch {
          // Ignore errors for individual watchlists
        }
      }

      return watchlistsContainingItem;
    },
    enabled:
      streamystatsEnabled &&
      Boolean(api?.accessToken) &&
      Boolean(itemId) &&
      Boolean(jellyfinServerId) &&
      Boolean(myWatchlists?.length),
    staleTime: 30 * 1000, // 30 seconds
  });
};
