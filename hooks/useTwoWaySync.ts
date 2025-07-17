import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useNetInfo } from "@react-native-community/netinfo";
import { useAtomValue } from "jotai";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "../providers/JellyfinProvider";
import { usePlaybackManager } from "./usePlaybackManager";

/**
 * This hook is used to sync the playback state of a downloaded item with the server
 * when the application comes back online after being used offline.
 */
export const useTwoWaySync = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const netInfo = useNetInfo();
  const { getDownloadedItemById, updateDownloadedItem } = useDownload();
  const { reportPlaybackProgress, markItemUnplayed, markItemPlayed } =
    usePlaybackManager();

  /**
   * Syncs the playback state of an offline item with the server.
   * It determines if the local or remote state is more recent and applies the necessary update.
   *
   * @returns A Promise<boolean> indicating whether a server update was made (true) or not (false).
   */
  const syncPlaybackState = async (itemId: string): Promise<boolean> => {
    if (!api || !user || !netInfo.isConnected) {
      // Cannot sync if offline or not logged in
      return false;
    }

    const localItem = getDownloadedItemById(itemId);
    if (!localItem) return false;

    const remoteItem = (
      await getUserLibraryApi(api).getItem({ itemId, userId: user.Id })
    ).data;
    if (!remoteItem) return false;

    const localLastPlayed = localItem.item.UserData?.LastPlayedDate
      ? new Date(localItem.item.UserData.LastPlayedDate)
      : new Date(0);
    const remoteLastPlayed = remoteItem.UserData?.LastPlayedDate
      ? new Date(remoteItem.UserData.LastPlayedDate)
      : new Date(0);

    // If the remote item has been played more recently or at the same time,
    // we take the server's version as the source of truth.
    if (remoteLastPlayed >= localLastPlayed) {
      updateDownloadedItem(itemId, {
        ...localItem,
        item: {
          ...localItem.item,
          UserData: {
            ...localItem.item.UserData,
            LastPlayedDate: remoteItem.UserData?.LastPlayedDate,
            PlaybackPositionTicks: remoteItem.UserData?.PlaybackPositionTicks,
            Played: remoteItem.UserData?.Played,
            PlayedPercentage: remoteItem.UserData?.PlayedPercentage,
          },
        },
      });
      return false;
    } else {
      // Since we're this is the source of truth, essentially need to make sure the played status matches the local item.
      localItem.item.UserData?.Played
        ? await markItemPlayed(localItem.item.Id!)
        : await markItemUnplayed(localItem.item.Id!);

      // The local item was played more recently (i.e., while offline),
      // so we need to push its state to the server using our manager.
      await reportPlaybackProgress(
        localItem.item.Id!,
        localItem.item.UserData?.PlaybackPositionTicks || 0,
      );
      return true;
    }
  };

  return { syncPlaybackState };
};
