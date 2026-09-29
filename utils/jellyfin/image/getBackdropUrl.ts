import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api";
import { getPrimaryImageUrl } from "./getPrimaryImageUrl";

/**
 * Retrieves the primary image URL for a given item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality (default: 10).
 */
export const getBackdropUrl = ({
  api,
  item,
  quality,
  width,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  quality?: number;
  width?: number;
}) => {
  if (!api || !item) {
    return null;
  }

  const backdropImageTags = item.BackdropImageTags?.[0];

  if (item.Type === "Episode") {
    return getPrimaryImageUrl({ api, item, quality, width });
  }

  if (backdropImageTags) {
    return getImageApi(api).getItemImageUrlById(item.Id!, "Backdrop", {
      quality: quality || undefined,
      fillWidth: width || undefined,
      tag: backdropImageTags,
      imageIndex: 0,
    });
  }
  return getPrimaryImageUrl({ api, item, quality, width });
};
