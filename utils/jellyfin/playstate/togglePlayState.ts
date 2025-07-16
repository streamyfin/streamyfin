import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import type { AxiosError } from "axios";
import type { useDownload } from "@/providers/DownloadProvider";

interface TogglePlayStateParams {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
  downloads: ReturnType<typeof useDownload>;
  isOffline?: boolean;
  played: boolean;
}

export const togglePlayState = async ({
  api,
  item,
  userId,
  downloads,
  isOffline = false,
  played,
}: TogglePlayStateParams): Promise<boolean> => {
  if (!item?.Id) {
    console.error("Invalid item for togglePlayState");
    return false;
  }

  if (isOffline) {
    const downloadedItem = downloads.getDownloadedItemById(item.Id);
    if (downloadedItem) {
      const newUserData = played
        ? {
            Played: true,
            LastPlayedDate: new Date().toISOString(),
            PlaybackPositionTicks: 0,
          }
        : {
            Played: false,
            LastPlayedDate: new Date().toISOString(),
            PlaybackPositionTicks: 0,
            PlayedPercentage: 0,
          };

      downloads.updateDownloadedItem(item.Id, {
        ...downloadedItem,
        item: {
          ...downloadedItem.item,
          UserData: {
            ...downloadedItem.item.UserData,
            ...newUserData,
          },
        },
      });
      return true;
    }
    return false;
  }

  if (!api || !userId) {
    console.error("Invalid parameters for online togglePlayState");
    return false;
  }

  try {
    if (played) {
      if (!item.RunTimeTicks) {
        console.error(
          "Invalid parameters for markAsPlayed (RunTimeTicks missing)",
        );
        return false;
      }
      const response = await getPlaystateApi(api).markPlayedItem({
        itemId: item.Id,
        datePlayed: new Date().toISOString(),
      });
      return response.status === 200;
    } else {
      await api.axiosInstance.delete(
        `${api.basePath}/UserPlayedItems/${item.Id}`,
        {
          params: { userId },
          headers: {
            Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
          },
        },
      );
      return true;
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(
      `Failed to toggle play state to ${played}:`,
      axiosError.message,
      axiosError.response?.status,
    );
    return false;
  }
};
