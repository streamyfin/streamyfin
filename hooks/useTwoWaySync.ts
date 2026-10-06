import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { isAxiosError } from "axios";
import { useAtomValue } from "jotai";
import { PLAYBACK_SYNC_REFUSAL_STATUSES } from "@/constants/Downloads";
import { useDownload } from "@/providers/DownloadProvider";
import { isGatewayBlockError, markExpectedError } from "@/utils/errors";
import { canUpdateUserData } from "@/utils/jellyfin/userDataAccess";
import { logAndCaptureError } from "@/utils/log";
import { apiAtom, userAtom } from "../providers/JellyfinProvider";
import { useNetworkStatus } from "./useNetworkStatus";

// Whether the server itself turned the push down for this user or this
// item. A gateway's 403 page is not that: it comes from where the user is,
// and the same request goes through from somewhere else.
const isServerRefusal = (error: unknown): boolean =>
  isAxiosError(error) &&
  error.response !== undefined &&
  PLAYBACK_SYNC_REFUSAL_STATUSES.includes(error.response.status) &&
  !isGatewayBlockError(error);

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
        if (isAxiosError(error) && error.response?.status === 404) {
          return undefined;
        }
        // A 403 is Jellyfin turning the user away, on every route alike:
        // outside their access schedule, or away from home without remote
        // access. Kept in the local log and out of Sentry, and nothing is
        // dropped: the playback state was never offered, the next run asks
        // again.
        const turnedAway =
          isAxiosError(error) && error.response?.status === 403;
        logAndCaptureError(
          "Fetching remote item during playback sync failed",
          turnedAway ? markExpectedError(error) : error,
        );
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
      // The server refuses this push for a user who may not change their
      // user data, and the app can tell without asking. Nothing is sent and
      // nothing is marked, so the state goes out once an admin gives the
      // permission back.
      if (!canUpdateUserData(user)) return false;
      const localLastPlayedDate = localItem.item.UserData?.LastPlayedDate;
      // The server already turned this very state down, and would again.
      if (
        localLastPlayedDate &&
        localItem.refusedPlaybackStateDate === localLastPlayedDate
      ) {
        return false;
      }
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
        // The server's answer about this user or this item, which the next
        // run would get again. Anything else (a server error, a rate limit,
        // a lost connection) leaves the state owed, and the next run sends
        // it again.
        const refused = isServerRefusal(error);
        if (refused) {
          // Remember which state it was for, so only a newer one is
          // offered. The download and its local progress stay as they are.
          // Read again before writing, the player may have moved the item
          // on while the request was out.
          const current = getDownloadedItemById(itemId);
          if (current && localLastPlayedDate) {
            updateDownloadedItem(itemId, {
              ...current,
              refusedPlaybackStateDate: localLastPlayedDate,
            });
          }
        }
        // Offline watch progress silently never reaches the server when
        // this fails, so report it, unless it was refused: that is not an
        // app defect and goes to the local log only.
        logAndCaptureError(
          "Pushing offline playback state to server failed",
          refused ? markExpectedError(error) : error,
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
