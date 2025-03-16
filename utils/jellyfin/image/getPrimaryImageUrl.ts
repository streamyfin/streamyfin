import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
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
export const getPrimaryImageUrl = ({
  api,
  item,
  quality = 80,
  width = 400,
}: {
  api?: Api | null;
  item?: BaseItemDto | BaseItemPerson | null;
  quality?: number | null;
  width?: number | null;
}) => {
  if (!item || !api) {
    return null;
  }

  if (!isBaseItemDto(item)) {
    return `${api?.basePath}/Items/${item?.Id}/Images/Primary`;
  }

  const primaryTag = item.ImageTags?.["Primary"];
  const backdropTag = item.BackdropImageTags?.[0];
  const parentBackdropTag = item.ParentBackdropImageTags?.[0];

  const params = new URLSearchParams({
    fillWidth: width ? String(width) : "500",
    quality: quality ? String(quality) : "80",
  });

  if (primaryTag) {
    params.set("tag", primaryTag);
  } else if (backdropTag) {
    params.set("tag", backdropTag);
  } else if (parentBackdropTag) {
    params.set("tag", parentBackdropTag);
  }

  return `${api?.basePath}/Items/${
    item.Id
  }/Images/Primary?${params.toString()}`;
};
