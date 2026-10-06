import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getPrimaryImageUrl } from "./getPrimaryImageUrl";
import { fillHeightParams } from "./imagePixels";

/**
 * Retrieves the backdrop image URL for a given item, falling back to its
 * primary image when it has no backdrop.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality.
 * @param width - The image width in physical pixels, not layout points:
 *   convert with `toImagePixels`.
 * @param height - The height of the box the image has to cover, in physical
 *   pixels. Pass it whenever the image is drawn cover fit.
 */
export const getBackdropUrl = ({
  api,
  item,
  quality,
  width,
  height,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  quality?: number;
  width?: number;
  height?: number;
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

  if (height) {
    for (const [name, value] of Object.entries(fillHeightParams(height))) {
      params.append(name, value);
    }
  }

  if (item.Type === "Episode") {
    return getPrimaryImageUrl({ api, item, quality, width, height });
  }

  if (backdropImageTags) {
    params.append("tag", backdropImageTags);
    return `${api.basePath}/Items/${
      item.Id
    }/Images/Backdrop/0?${params.toString()}`;
  }
  return getPrimaryImageUrl({ api, item, quality, width, height });
};
