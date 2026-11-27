import type { Api } from "@jellyfin/sdk";
import { getItemImageUrlById } from "./getItemImageUrl";

/**
 * Retrieves the primary image URL for a given item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 */
export const getPrimaryImageUrlById = ({
  api,
  id,
  width = 500,
}: {
  api?: Api | null;
  id?: string | null;
  /** @deprecated Quality follows the image type; this is ignored. */
  quality?: number | null;
  width?: number | null;
}) =>
  getItemImageUrlById(api, id, "Primary", {
    width: width || 500,
  });
