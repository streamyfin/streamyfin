import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemImageUrl } from "./getItemImageUrl";

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
}) =>
  getItemImageUrl(api, item, "primary", {
    width: width || 500,
    quality: quality || 80,
    height: height || undefined,
  });
