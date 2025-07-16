import { PlaybackProgressInfo } from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api/playstate-api";
import { useAtomValue } from "jotai";
import { useDownload } from "@/providers/DownloadProvider";
import { DownloadedItem } from "@/providers/Downloads/types";
import { useSettings } from "@/utils/atoms/settings";
import { apiAtom, userAtom } from "../providers/JellyfinProvider";

/**
 * This hook is used to sync the playback state of a downloaded item with the server.
 * It ensures that the playback state of a downloaded item is always up to date.
 *
 * The syncPlaybackState function returns a Promise<boolean> indicating whether a server update was made (true) or not (false).
 */
export const useTwoWaySync = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const [_settings] = useSettings();
  const { getDownloadedItemById, updateDownloadedItem } = useDownload();

  const syncPlaybackState = async (itemId: string) => {
    if (!api || !user) {
      return;
    }

    const localItem = getDownloadedItemById(itemId);
    if (!localItem) return;

    const remoteItem = (
      await getUserLibraryApi(api).getItem({ itemId, userId: user.Id })
    ).data;
    if (!remoteItem) return;

    const localLastPlayed = localItem.item.UserData?.LastPlayedDate
      ? new Date(localItem.item.UserData.LastPlayedDate)
      : new Date(0);
    const remoteLastPlayed = remoteItem.UserData?.LastPlayedDate
      ? new Date(remoteItem.UserData.LastPlayedDate)
      : new Date(0);

    console.log("localItem", localItem.item.Name);
    console.log("localLastPlayed", localLastPlayed);
    console.log("remoteLastPlayed", remoteLastPlayed);

    // Update our local item if the remote has been played more recently.
    // Another edge case is when the remote item not been played. We want to sync that with the se
    // If they're same we fall back to the server as the single source of truth.
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
    } else {
      console.log("syncing local to remote", localItem.item.Name);
      await syncLocalToRemote(localItem);
      return true;
    }

    return false;
  };

  /**
   * This function is used to sync the playback state of a downloaded item with the server.
   */
  const syncLocalToRemote = async (localItem: DownloadedItem) => {
    if (!api || !user) {
      return;
    }

    // If the local Item is marked as completed, we mark it as played on the server.
    // Report the playback progress to the server.

    console.log(
      "playback position ticks",
      localItem.item.UserData?.PlaybackPositionTicks,
    );

    // If the local item is marked as played, we mark it as played on the server.
    if (localItem.item.UserData?.Played) {
      await getPlaystateApi(api).markPlayedItem({
        itemId: localItem.item.Id!,
        datePlayed: new Date().toISOString(),
      });
    } else {
      // If the local item is marked as unplayed, we mark it as unplayed on the server.
      await getPlaystateApi(api).markUnplayedItem({
        itemId: localItem.item.Id!,
      });
    }

    await getPlaystateApi(api).reportPlaybackProgress({
      playbackProgressInfo: {
        ItemId: localItem.item.Id,
        PositionTicks: localItem.item.UserData?.PlaybackPositionTicks,
      } as PlaybackProgressInfo,
    });
    // Pull back whatever the server gives us we use that as the single source of truth.
    // We do this because sometimes, the server marks things as played when the posistion ticks marks a certain point.
    const remoteItem = (
      await getUserLibraryApi(api).getItem({
        itemId: localItem.item.Id!,
        userId: user.Id,
      })
    ).data;
    if (!remoteItem) {
      return;
    }
    console.log(
      "remote item after synced played status",
      remoteItem.UserData?.Played,
    );
    console.log("remote last played date", remoteItem.UserData?.LastPlayedDate);

    updateDownloadedItem(localItem.item.Id!, {
      ...localItem,
      item: {
        ...localItem.item,
        UserData: {
          ...remoteItem.UserData,
        },
      },
    });

    const localItem2 = getDownloadedItemById(localItem.item.Id!);

    console.log("localItem2", localItem2?.item.UserData?.LastPlayedDate);
  };

  return { syncPlaybackState, syncLocalToRemote };
};
