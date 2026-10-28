import type { Api } from "@jellyfin/sdk";
import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api";
import { fillHeightImageParams } from "./imagePixels";

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

  return getImageApi(api).getItemImageUrlById(parentId!, "Backdrop", {
    fillWidth: width || 500,
    quality: quality || 80,
    tag,
    imageIndex: 0,
    ...(height ? fillHeightImageParams(height) : null),
  });
};
