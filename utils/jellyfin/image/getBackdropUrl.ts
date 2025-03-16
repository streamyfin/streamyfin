import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
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

  const params = new URLSearchParams();

  if (quality) {
    params.append("quality", quality.toString());
  }

  if (width) {
    params.append("fillWidth", width.toString());
  }

  if (item.Type === "Episode") {
    return getPrimaryImageUrl({ api, item, quality, width });
  }

  if (backdropImageTags) {
    params.append("tag", backdropImageTags);
    return `${api.basePath}/Items/${
      item.Id
    }/Images/Backdrop/0?${params.toString()}`;
  } else {
    return getPrimaryImageUrl({ api, item, quality, width });
  }
};
