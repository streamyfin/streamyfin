import { Api } from "@jellyfin/sdk";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { AxiosError } from "axios";
import { getAuthHeaders } from "../jellyfin";

interface MarkAsPlayedParams {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
}

/**
 * Marks a media item as played and updates its progress to completion.
 *
 * @param params - The parameters for marking an item as played
 * @returns A promise that resolves to true if the operation was successful, false otherwise
 */
export const markAsPlayed = async ({ api, item, userId }: MarkAsPlayedParams): Promise<boolean> => {
  if (!api || !item?.Id || !userId || !item.RunTimeTicks) {
    console.error("Invalid parameters for markAsPlayed");
    return false;
  }

  try {
    const [playedResponse] = await Promise.all([
      api.axiosInstance.post(
        `${api.basePath}/UserPlayedItems/${item.Id}`,
        { userId, datePlayed: new Date().toISOString() },
        { headers: getAuthHeaders(api) }
      ),
    ]);

    return playedResponse.status === 200;
  } catch (error) {
    return false;
  }
};
