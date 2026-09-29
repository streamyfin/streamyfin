import type { Api } from "@jellyfin/sdk";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * Retrieves the primary image URL for a given item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality (default: 90).
 */
export const getPrimaryImageUrlById = ({
  api,
  id,
  quality = 90,
  width = 500,
}: {
  api?: Api | null;
  id?: string | null;
  quality?: number | null;
  width?: number | null;
}) => {
  if (!id || !api) {
    return null;
  }

  return getImageApi(api).getItemImageUrlById(id, "Primary", {
    fillWidth: width || 500,
    quality: quality || 90,
  });
};
