import type { Api } from "@jellyfin/sdk";
import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fillHeightParams } from "./imagePixels";

/**
 * Retrieves the backdrop image URL of an item's parent: the series backdrop
 * for an episode or a season.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality (default: 80).
 * @param width - The image width in physical pixels, not layout points:
 *   convert with `toImagePixels`.
 * @param height - The height of the box the image has to cover, in physical
 *   pixels. Pass it whenever the image is drawn cover fit.
 */
export const getParentBackdropImageUrl = ({
  api,
  item,
  quality = 80,
  width = 400,
  height,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  quality?: number | null;
  width?: number | null;
  height?: number | null;
}) => {
  if (!item || !api) {
    return null;
  }

  const parentId = item.ParentBackdropItemId;
  const tag = item.ParentBackdropImageTags?.[0] || "";

  const params = new URLSearchParams({
    fillWidth: width ? String(width) : "500",
    quality: quality ? String(quality) : "80",
    tag: tag,
    ...(height ? fillHeightParams(height) : null),
  });

  return `${
    api?.basePath
  }/Items/${parentId}/Images/Backdrop/0?${params.toString()}`;
};
