import type { Api } from "@jellyfin/sdk";
import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemImageUrl } from "./getItemImageUrl";

/**
 * Retrieves the backdrop image URL of an item's parent: the series backdrop
 * for an episode or a season.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param width - The image width in physical pixels, not layout points:
 *   convert with `toImagePixels`.
 * @param height - The height of the box the image has to cover, in physical
 *   pixels. Pass it whenever the image is drawn cover fit.
 */
export const getParentBackdropImageUrl = ({
  api,
  item,
  width = 400,
  height,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  /** @deprecated Quality follows the image type; this is ignored. */
  quality?: number | null;
  width?: number | null;
  height?: number | null;
}) =>
  getItemImageUrl(api, item, "parentBackdrop", {
    width: width || 500,
    height: height || undefined,
  });
