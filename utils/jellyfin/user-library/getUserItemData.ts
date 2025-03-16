import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";

/**
 *  Fetches the media info for a given item.
 *
 * @param {Api} api - The Jellyfin API instance.
 * @param  {string} itemId - The ID of the media to fetch info for.
 * @param {string} userId - The ID of the user to fetch info for.
 *
 * @returns {Promise<BaseItemDto>} - The media info.
 */
export const getUserItemData = async ({
  api,
  itemId,
  userId,
}: {
  api: Api | null | undefined;
  itemId: string | null | undefined;
  userId: string | null | undefined;
}): Promise<BaseItemDto | null> => {
  if (!api || !itemId || !userId) {
    return null;
  }
  return (await getUserLibraryApi(api).getItem({ itemId, userId })).data;
};
