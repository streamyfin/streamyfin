import type { Api } from "@jellyfin/sdk";
import type { AxiosError } from "axios";

interface MarkAsNotPlayedParams {
  api: Api | null | undefined;
  itemId: string | null | undefined;
  userId: string | null | undefined;
}

/**
 * Marks a media item as not played for a specific user.
 *
 * @param params - The parameters for marking an item as not played
 * @returns A promise that resolves to true if the operation was successful, false otherwise
 */
export const markAsNotPlayed = async ({
  api,
  itemId,
  userId,
}: MarkAsNotPlayedParams): Promise<void> => {
  if (!api || !itemId || !userId) {
    console.error("Invalid parameters for markAsNotPlayed");
    return;
  }

  try {
    await api.axiosInstance.delete(
      `${api.basePath}/UserPlayedItems/${itemId}`,
      {
        params: { userId },
        headers: {
          Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
        },
      },
    );
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error(
      "Failed to mark item as not played:",
      axiosError.message,
      axiosError.response?.status,
    );
    return;
  }
};
