import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getLibraryApi, getUserDataApi } from "@jellyfin/sdk/lib/utils/api";
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
/**
 * How one item's playback state was reconciled: the local state was sent to
 * the server, the server's was taken, both already agreed, the item no longer
 * exists on the server, or it could not be settled (offline, the request
 * failed).
 */
export type PlaybackSyncResult =
  | "pushed"
  | "pulled"
  | "unchanged"
  | "missing"
  | "failed";

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
  const syncPlaybackStateDetailed = async (
    itemId: string,
    // false only takes the server's state: the local progress is shared by every
    // account on the device, so only a sync that knows this user queued it may
    // send it (useOfflineProgressSync).
    // stamp: the LastPlayedDate this user's queued save wrote. The record is
    // read again after the fetch, and a save by another account (switched to
    // while the fetch was out) must not be sent as this user's.
    { push = true, stamp }: { push?: boolean; stamp?: string } = {},
  ): Promise<PlaybackSyncResult> => {
    if (!api || !user || !isConnected) {
      // Cannot sync if offline or not logged in
      return "failed";
    }

    if (!getDownloadedItemById(itemId)) return "unchanged";

    const fetchRemoteItem = async (): Promise<
      BaseItemDto | "missing" | undefined
    > => {
      try {
        return (await getLibraryApi(api).getItem({ itemId, userId: user.Id }))
          .data;
      } catch (error) {
        // A 404 means the item was deleted server-side while still downloaded
        // locally, there is nothing to sync and no error worth surfacing.
        if (error instanceof AxiosError && error.response?.status === 404) {
          return "missing";
        }
        logAndCaptureError(
          "Fetching remote item during playback sync failed",
          error,
        );
        return undefined;
      }
    };
    const fetched = await fetchRemoteItem();
    if (fetched === "missing") return "missing";
    if (!fetched) return "failed";
    const remoteItem = fetched;
    // A progress save can land while the fetch is out; compare with, and write
    // back over, the record as it is now rather than the one read before.
    const currentItem = getDownloadedItemById(itemId);
    if (!currentItem) return "unchanged";
    const localItem = currentItem;

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
            Key: "",
            ...localItem.item.UserData,
            ...(remoteItem.UserData?.Key !== undefined && {
              Key: remoteItem.UserData.Key,
            }),
            LastPlayedDate: remoteItem.UserData?.LastPlayedDate,
            PlaybackPositionTicks: remoteItem.UserData?.PlaybackPositionTicks,
            Played: remoteItem.UserData?.Played,
            PlayedPercentage: remoteItem.UserData?.PlayedPercentage,
          },
        },
      });
      return "pulled";
    } else if (remoteLastPlayed < localLastPlayed) {
      if (!push) return "unchanged";
      // Saved again since this user's save: not provably theirs. A newer save
      // of their own re-queued it with its own stamp, for the next run.
      if (stamp && localItem.item.UserData?.LastPlayedDate !== stamp) {
        return "unchanged";
      }
      // Since we're this is the source of truth, essentially need to make sure the played status matches the local item.
      try {
        await getUserDataApi(api).updateItemUserData({
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
        return "failed";
      }
      return "pushed";
    }
    return "unchanged";
  };

  /** Whether the server's state was updated. */
  const syncPlaybackState = async (itemId: string): Promise<boolean> =>
    (await syncPlaybackStateDetailed(itemId)) === "pushed";

  return { syncPlaybackState, syncPlaybackStateDetailed };
};
