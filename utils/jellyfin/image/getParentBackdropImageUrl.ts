import type { Api } from "@jellyfin/sdk";
import {
  type BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { isBaseItemDto } from "../jellyfin";

/**
 * Retrieves the primary image URL for a given item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality (default: 90).
 */
export const getParentBackdropImageUrl = ({
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

  const parentId = item.ParentBackdropItemId;
  const tag = item.ParentBackdropImageTags?.[0] || "";

  const params = new URLSearchParams({
    fillWidth: width ? String(width) : "500",
    quality: quality ? String(quality) : "80",
    tag: tag,
  });

  return `${
    api?.basePath
  }/Items/${parentId}/Images/Backdrop/0?${params.toString()}`;
};
