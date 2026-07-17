import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * Fetches intro items for a given media item using the Jellyfin SDK
 * @param api - The Jellyfin API instance
 * @param itemId - The ID of the media item
 * @param userId - Optional user ID
 * @returns Promise<BaseItemDto[]> - Array of intro items
 */
export async function getIntros(
  api: Api,
  itemId: string,
  userId?: string,
): Promise<BaseItemDto[]> {
  try {
    const response = await getUserLibraryApi(api).getIntros({
      itemId,
      userId,
    });

    return response.data.Items || [];
  } catch (error) {
    console.error("Error fetching intros:", error);
    return [];
  }
}
