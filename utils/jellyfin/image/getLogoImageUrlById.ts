import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { LOGO_HEIGHT, MAX_LOGO_HEIGHT_PX } from "@/constants/Images";
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
}) => {
  if (!api || !item) {
    return null;
  }

  const params = new URLSearchParams();

  params.append("quality", "90");
  params.append(
    "fillHeight",
    Math.min(Math.round(height), MAX_LOGO_HEIGHT_PX).toString(),
  );

  if (item.Type === "Episode") {
    const imageTag = item.ParentLogoImageTag;
    const parentId = item.ParentLogoItemId;

    if (!parentId || !imageTag) {
      return null;
    }

    params.append("tag", imageTag);

    return `${api.basePath}/Items/${parentId}/Images/Logo?${params.toString()}`;
  }

  const imageTag = item.ImageTags?.Logo;

  if (!imageTag) return null;

  params.append("tag", imageTag);

  return `${api.basePath}/Items/${item.Id}/Images/Logo?${params.toString()}`;
};
