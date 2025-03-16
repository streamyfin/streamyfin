import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

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

  const params = new URLSearchParams();

  params.append("quality", "90");
  params.append("fillHeight", height.toString());

  if (item.Type === "Episode") {
    const imageTag = item.ParentLogoImageTag;
    const parentId = item.ParentLogoItemId;

    if (!parentId || !imageTag) {
      return null;
    }

    params.append("tag", imageTag);

    return `${api.basePath}/Items/${parentId}/Images/Logo?${params.toString()}`;
  }

  const imageTag = item.ImageTags?.["Logo"];

  if (!imageTag) return null;

  params.append("tag", imageTag);

  return `${api.basePath}/Items/${item.Id}/Images/Logo?${params.toString()}`;
};
