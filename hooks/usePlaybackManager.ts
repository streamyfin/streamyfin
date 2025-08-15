import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getPlaystateApi, getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api/user-library-api";
import { useNetInfo } from "@react-native-community/netinfo";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { useDownload } from "@/providers/DownloadProvider";
import { DownloadedItem } from "@/providers/Downloads/types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

interface PlaybackManagerProps {
  item?: BaseItemDto | null;
  isOffline?: boolean;
}

/**
 * Gets adjacent items (previous/current/next) for offline mode from downloaded files
 */
const getOfflineAdjacentItems = (
  item: BaseItemDto,
  downloadedFiles: DownloadedItem[],
): BaseItemDto[] | null => {
  if (!item.SeriesId || !downloadedFiles) {
    return null;
  }

  const seriesEpisodes = downloadedFiles
    .filter((f) => f.item.SeriesId === item.SeriesId)
    .map((f) => f.item);

  seriesEpisodes.sort((a, b) => {
    if (a.ParentIndexNumber !== b.ParentIndexNumber) {
      return (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0);
    }
    return (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);
  });

  const currentIndex = seriesEpisodes.findIndex((ep) => ep.Id === item.Id);

  if (currentIndex === -1) {
    return null;
  }

  const result: BaseItemDto[] = [];
  if (currentIndex > 0) {
    result.push(seriesEpisodes[currentIndex - 1]);
  }
  result.push(seriesEpisodes[currentIndex]);
  if (currentIndex < seriesEpisodes.length - 1) {
    result.push(seriesEpisodes[currentIndex + 1]);
  }
  return result;
};

/**
 * A hook to manage playback state, abstracting away the complexities of
 * online/offline and local/remote state management.
 *
 * This provides a simple facade for player components to report playback
 * without needing to know the underlying details of data syncing.
 */
export const usePlaybackManager = ({
  item,
  isOffline = false,
}: PlaybackManagerProps = {}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const netInfo = useNetInfo();
  const { getDownloadedItemById, updateDownloadedItem, downloadedFiles } =
    useDownload();

  /** Whether the device is online. actually it's connected to the internet. */
  const isOnline = netInfo.isConnected;

  // Adjacent episodes logic
  const { data: adjacentItems } = useQuery({
    queryKey: ["adjacentItems", item?.Id, item?.SeriesId, isOffline],
    queryFn: async (): Promise<BaseItemDto[] | null> => {
      if (!item || !item.SeriesId) {
        return null;
      }

      if (isOffline) {
        return getOfflineAdjacentItems(item, downloadedFiles || []);
      }

      if (!api) {
        return null;
      }

      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.SeriesId,
        adjacentTo: item.Id,
        limit: 3,
        fields: ["MediaSources", "MediaStreams", "ParentId"],
      });

      return res.data.Items || null;
    },
    enabled:
      (isOffline || !!api) &&
      !!item?.Id &&
      !!item?.SeriesId &&
      (item?.Type === "Episode" || item?.Type === "Audio"),
    staleTime: 0,
  });

  const previousItem = useMemo(() => {
    if (!adjacentItems || adjacentItems.length <= 1) {
      return null;
    }

    if (adjacentItems.length === 2) {
      return adjacentItems[0].Id === item?.Id ? null : adjacentItems[0];
    }

    return adjacentItems[0];
  }, [adjacentItems, item]);

  /** The next item in the series */
  const nextItem = useMemo(() => {
    if (!adjacentItems || adjacentItems.length <= 1) {
      return null;
    }

    if (adjacentItems.length === 2) {
      return adjacentItems[1].Id === item?.Id ? null : adjacentItems[1];
    }

    return adjacentItems[2];
  }, [adjacentItems, item]);

  /**
   * Fetches the latest state of an item from the server and updates the local
   * downloaded version to match. This ensures the local item has the
   * canonical state from the server.
   */
  const _syncRemoteToLocal = async (localItem: DownloadedItem) => {
    if (!isOnline || !api || !user) return;

    try {
      const remoteItem = (
        await getUserLibraryApi(api).getItem({
          itemId: localItem.item.Id!,
          userId: user.Id,
        })
      ).data;
      if (remoteItem) {
        updateDownloadedItem(localItem.item.Id!, {
          ...localItem,
          item: {
            ...localItem.item,
            UserData: { ...remoteItem.UserData },
          },
        });
      }
    } catch (error) {
      console.error("Failed to sync remote item state to local", error);
    }
  };

  /**
   * Reports playback progress.
   *
   * - If offline and the item is downloaded, updates are saved locally.
   * - If online and the item is downloaded, it updates locally and syncs with the server.
   * - If online and streaming, it reports directly to the server.
   *
   * @param itemId The ID of the item.
   * @param positionTicks The current playback position in ticks.
   */
  const reportPlaybackProgress = async (
    itemId: string,
    positionTicks: number,
    metadata?: {
      AudioStreamIndex: number;
      SubtitleStreamIndex: number;
    },
  ) => {
    const localItem = getDownloadedItemById(itemId);

    // Handle local state update for downloaded items
    if (localItem) {
      const isItemConsideredPlayed =
        (localItem.item.UserData?.PlayedPercentage ?? 0) > 90;
      updateDownloadedItem(itemId, {
        ...localItem,
        item: {
          ...localItem.item,
          UserData: {
            ...localItem.item.UserData,
            PlaybackPositionTicks: isItemConsideredPlayed ? 0 : positionTicks,
            Played: isItemConsideredPlayed,
            LastPlayedDate: new Date().toISOString(),
            PlayedPercentage: isItemConsideredPlayed
              ? 0
              : (positionTicks / localItem.item.RunTimeTicks!) * 100,
          },
        },
      });
    }

    // Handle remote state update if online
    if (isOnline && api) {
      await getPlaystateApi(api).reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: itemId,
          PositionTicks: positionTicks,
          ...(metadata && { AudioStreamIndex: metadata.AudioStreamIndex }),
          ...(metadata && {
            SubtitleStreamIndex: metadata.SubtitleStreamIndex,
          }),
        },
      });
      // If it was a downloaded item, re-sync with the server for the latest state.
      // This is crucial because the server might have marked the item as "Played"
      // based on its own rules (e.g., >95% progress).
      if (localItem) {
        await _syncRemoteToLocal(localItem);
      }
    }
  };

  /**
   * Marks an item as played.
   *
   * - If offline and downloaded, it marks as played locally.
   * - If online, it marks as played on the server and syncs the state back to the local item if it exists.
   *
   * @param itemId The ID of the item.
   */
  const markItemPlayed = async (itemId: string) => {
    const localItem = getDownloadedItemById(itemId);

    // Handle local state update for downloaded items
    if (localItem) {
      updateDownloadedItem(itemId, {
        ...localItem,
        item: {
          ...localItem.item,
          UserData: {
            ...localItem.item.UserData,
            Played: true,
            PlaybackPositionTicks: 0,
            PlayedPercentage: 0,
            LastPlayedDate: new Date().toISOString(),
          },
        },
      });
    }

    // Handle remote state update if online
    if (isOnline && api && user) {
      try {
        await getPlaystateApi(api).markPlayedItem({
          itemId,
          userId: user.Id,
        });

        // If it was a downloaded item, re-sync with server for the latest state
        if (localItem) {
          await _syncRemoteToLocal(localItem);
        }
      } catch (error) {
        console.error("Failed to mark item as played on server", error);
      }
    }
  };

  /**
   * Marks an item as unplayed.
   *
   * - If offline and downloaded, it marks as unplayed locally.
   * - If online, it marks as unplayed on the server and syncs the state back to the local item if it exists.
   *
   * @param itemId The ID of the item.
   */
  const markItemUnplayed = async (itemId: string) => {
    const localItem = getDownloadedItemById(itemId);

    // Handle local state update for downloaded items
    if (localItem) {
      updateDownloadedItem(itemId, {
        ...localItem,
        item: {
          ...localItem.item,
          UserData: {
            ...localItem.item.UserData,
            Played: false,
            PlaybackPositionTicks: 0,
            PlayedPercentage: 0,
            LastPlayedDate: new Date().toISOString(), // Keep track of when it was marked unplayed
          },
        },
      });
    }

    // Handle remote state update if online
    if (isOnline && api && user) {
      try {
        await getPlaystateApi(api).markUnplayedItem({
          itemId,
          userId: user.Id,
        });

        // If it was a downloaded item, re-sync with server for the latest state
        if (localItem) {
          await _syncRemoteToLocal(localItem);
        }
      } catch (error) {
        console.error("Failed to mark item as unplayed on server", error);
      }
    }
  };

  return {
    reportPlaybackProgress,
    markItemPlayed,
    markItemUnplayed,
    previousItem,
    nextItem,
  };
};
