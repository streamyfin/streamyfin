import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";

interface MarkAsPlayedParams {
  api: Api | null | undefined;
  item: BaseItemDto | null | undefined;
  userId: string | null | undefined;
}

/**
 * Marks a media item as played and updates its progress to completion.
 *
 * @param params - The parameters for marking an item as played∏
 * @returns A promise that resolves to true if the operation was successful, false otherwise
 */
export const markAsPlayed = async ({
  api,
  item,
  userId,
}: MarkAsPlayedParams): Promise<boolean> => {
  if (!api || !item?.Id || !userId || !item.RunTimeTicks) {
    console.error("Invalid parameters for markAsPlayed");
    return false;
  }

  try {
    const response = await getPlaystateApi(api).markPlayedItem({
      itemId: item.Id,
      datePlayed: new Date().toISOString(),
    });

    return response.status === 200;
  } catch (error) {
    return false;
  }
};
