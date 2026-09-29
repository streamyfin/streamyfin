import type { Api } from "@jellyfin/sdk";
import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getImageApi } from "@jellyfin/sdk/lib/utils/api";

/**
 * Retrieves the primary image URL for a given item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality (default: 90).
 */
export const getPrimaryParentImageUrl = ({
  api,
  item,
  quality = 80,
  width = 400,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  quality?: number | null;
  width?: number | null;
}) => {
  if (!item || !api) {
    return null;
  }

  const parentId = item.ParentId;
  const primaryTag = item.ParentPrimaryImageTag?.[0];

  return getImageApi(api).getItemImageUrlById(parentId!, "Primary", {
    fillWidth: width || 500,
    quality: quality || 80,
    tag: primaryTag || "",
  });
};
