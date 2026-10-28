import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api";
import { isBaseItemDto } from "../jellyfin";
import { fillHeightImageParams } from "./imagePixels";

/**
 * Retrieves the primary image URL for a given item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality (default: 80).
 * @param width - The image width in physical pixels, not layout points:
 *   convert with `toImagePixels`.
 * @param height - The height of the box the image has to cover, in physical
 *   pixels. Pass it whenever the image is drawn cover fit.
 */
export const getPrimaryImageUrl = ({
  api,
  item,
  quality = 80,
  width = 400,
  height,
}: {
  api?: Api | null;
  item?: BaseItemDto | BaseItemPerson | null;
  quality?: number | null;
  width?: number | null;
  height?: number | null;
}) => {
  // Every URL below is built from the item's Id: without one there is no
  // image to ask for, whatever was handed over (an answer that is not an
  // item, restored from an older cache, is a string).
  if (!api || !item?.Id) {
    return null;
  }

  if (!isBaseItemDto(item)) {
    return getImageApi(api).getItemImageUrlById(item.Id, "Primary");
  }

  const primaryTag = item.ImageTags?.Primary;
  const backdropTag = item.BackdropImageTags?.[0];
  const parentBackdropTag = item.ParentBackdropImageTags?.[0];

  return getImageApi(api).getItemImageUrlById(item.Id, "Primary", {
    fillWidth: width || 500,
    quality: quality || 80,
    tag: primaryTag || backdropTag || parentBackdropTag || undefined,
    ...(height ? fillHeightImageParams(height) : null),
  });
};
