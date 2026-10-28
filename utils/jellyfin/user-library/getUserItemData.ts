import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { AxiosError } from "axios";
import { isJellyfinItem } from "@/utils/jellyfin/jellyfin";

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
  const response = await getUserLibraryApi(api).getItem({ itemId, userId });
  // Resolved with, such an answer was cached and saved on the device as the
  // item, and a page reading it as one threw (Sentry REACT-NATIVE-NY). Thrown
  // with the response, it fails the query, which keeps the item it had and
  // retries, and the app's reporting describes the answer.
  if (!isJellyfinItem(response.data)) {
    throw new AxiosError(
      "Response is not an item",
      AxiosError.ERR_BAD_RESPONSE,
      response.config,
      response.request,
      response,
    );
  }
  return response.data;
};
