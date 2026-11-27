import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { LOGO_HEIGHT } from "@/constants/Images";
import { getItemImageUrl } from "./getItemImageUrl";
import { toImagePixels } from "./imagePixels";

/**
 * Retrieves the logo image URL for a given item. An episode has no logo of
 * its own and gets its series' logo.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the logo image URL for.
 * @param height - The image height in physical pixels, not layout points:
 *   convert with `toImagePixels`. Defaults to the detail page logo slot on
 *   this screen.
 */
export const getLogoImageUrlById = ({
  api,
  item,
  height = toImagePixels(LOGO_HEIGHT),
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  height?: number;
}) => getItemImageUrl(api, item, "logo", { height });
