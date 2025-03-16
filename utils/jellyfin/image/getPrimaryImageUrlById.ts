import type { Api } from "@jellyfin/sdk";

/**
 * Retrieves the primary image URL for a given item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The media item to retrieve the backdrop image URL for.
 * @param quality - The desired image quality (default: 90).
 */
export const getPrimaryImageUrlById = ({
  api,
  id,
  quality = 90,
  width = 500,
}: {
  api?: Api | null;
  id?: string | null;
  quality?: number | null;
  width?: number | null;
}) => {
  if (!id) {
    return null;
  }

  const params = new URLSearchParams({
    fillWidth: width ? String(width) : "500",
    quality: quality ? String(quality) : "90",
  });

  return `${api?.basePath}/Items/${id}/Images/Primary?${params.toString()}`;
};
