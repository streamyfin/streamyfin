import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * Retrieves the primary image URL for a given item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality (default: 10).
 */
export const getLogoImageUrlById = ({
  api,
  item,
  height = 130,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  height?: number;
}) => {
  if (!api || !item) {
    return null;
  }

  if (item.Type === "Episode") {
    const imageTag = item.ParentLogoImageTag;
    const parentId = item.ParentLogoItemId;

    if (!parentId || !imageTag) {
      return null;
    }

    return getImageApi(api).getItemImageUrlById(parentId, "Logo", {
      quality: 90,
      fillHeight: height,
      tag: imageTag,
    });
  }

  const imageTag = item.ImageTags?.Logo;

  if (!imageTag) return null;

  return getImageApi(api).getItemImageUrlById(item.Id!, "Logo", {
    quality: 90,
    fillHeight: height,
    tag: imageTag,
  });
};
