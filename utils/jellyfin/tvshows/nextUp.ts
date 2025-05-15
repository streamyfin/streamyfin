import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { AxiosError } from "axios";
import { getAuthHeaders } from "../jellyfin";

interface NextUpParams {
  itemId?: string | null;
  userId?: string | null;
  api?: Api | null;
}

/**
 * Fetches the next up episodes for a series or all series for a user.
 *
 * @param params - The parameters for fetching next up episodes
 * @returns A promise that resolves to an array of BaseItemDto representing the next up episodes
 */
export const nextUp = async ({
  itemId,
  userId,
  api,
}: NextUpParams): Promise<BaseItemDto[]> => {
  if (!userId || !api) {
    console.error("Invalid parameters for nextUp: missing userId or api");
    return [];
  }

  try {
    const response = await api.axiosInstance.get<{ Items: BaseItemDto[] }>(
      `${api.basePath}/Shows/NextUp`,
      {
        params: {
          SeriesId: itemId || undefined,
          UserId: userId,
          Fields: "MediaSourceCount",
        },
        headers: getAuthHeaders(api),
      },
    );

    return response.data.Items;
  } catch (error) {
    return [];
  }
};
