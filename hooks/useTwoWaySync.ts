import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { AxiosError } from "axios";
import { useAtomValue } from "jotai";
import { useDownload } from "@/providers/DownloadProvider";
import { logAndCaptureError } from "@/utils/log";
import { apiAtom, userAtom } from "../providers/JellyfinProvider";
import { useNetworkStatus } from "./useNetworkStatus";

/**
 * This hook is used to sync the playback state of a downloaded item with the server
 * when the application comes back online after being used offline.
 */
export const useTwoWaySync = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { getDownloadedItemById, updateDownloadedItem } = useDownload();
  const { isConnected } = useNetworkStatus();

  /**
   * Syncs the playback state of an offline item with the server.
   * It determines if the local or remote state is more recent and applies the necessary update.
   *
   * @returns A Promise<boolean> indicating whether a server update was made (true) or not (false).
   */
  const syncPlaybackState = async (itemId: string): Promise<boolean> => {
    if (!api || !user || !isConnected) {
      // Cannot sync if offline or not logged in
      return false;
    }

    const localItem = getDownloadedItemById(itemId);
    if (!localItem) return false;

    const fetchRemoteItem = async (): Promise<
      (typeof localItem)["item"] | undefined
    > => {
      try {
        return (
          await getUserLibraryApi(api).getItem({ itemId, userId: user.Id })
        ).data;
      } catch (error) {
        // A 404 means the item was deleted server-side while still downloaded
        // locally, there is nothing to sync and no error worth surfacing.
        if (!(error instanceof AxiosError && error.response?.status === 404)) {
          logAndCaptureError(
            "Fetching remote item during playback sync failed",
            error,
          );
        }
        return undefined;
      }
    };
    const remoteItem = await fetchRemoteItem();
    if (!remoteItem) return false;

    const localLastPlayed = localItem.item.UserData?.LastPlayedDate
      ? new Date(localItem.item.UserData.LastPlayedDate)
      : new Date(0);
    const remoteLastPlayed = remoteItem.UserData?.LastPlayedDate
      ? new Date(remoteItem.UserData.LastPlayedDate)
      : new Date(0);

    // If the remote item has been played more recently, we take the server's version as the source of truth.
    if (remoteLastPlayed > localLastPlayed) {
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
    } else if (remoteLastPlayed < localLastPlayed) {
      // Since we're this is the source of truth, essentially need to make sure the played status matches the local item.
      try {
        await getItemsApi(api).updateItemUserData({
          itemId: localItem.item.Id!,
          userId: user.Id,
          updateUserItemDataDto: {
            Played: localItem.item.UserData?.Played,
            PlaybackPositionTicks:
              localItem.item.UserData?.PlaybackPositionTicks,
            PlayedPercentage: localItem.item.UserData?.PlayedPercentage,
            LastPlayedDate: localItem.item.UserData?.LastPlayedDate,
          },
        });
      } catch (error) {
        // Offline watch progress silently never reaches the server when
        // this fails, so report it.
        logAndCaptureError(
          "Pushing offline playback state to server failed",
          error,
        );
        // The write never reached the server, so the caller must not treat
        // this as a successful update.
        return false;
      }
      return true;
    }
    return false;
  };

  return { syncPlaybackState };
};
