import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Retrieves a high-quality image URL for a photo item.
 *
 * @param api - The Jellyfin API instance.
 * @param item - The photo item to retrieve the image URL for.
 * @param quality - The desired image quality (default: 100).
 * @param width - The desired image width (optional).
 * @param height - The desired image height (optional).
 */
export const getPhotoImageUrl = ({
  api,
  item,
  quality = 100,
  width,
  height,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  quality?: number | null;
  width?: number | null;
  height?: number | null;
}): string | null => {
  if (!item || !api) {
    return null;
  }

  const params = new URLSearchParams();

  // Set quality parameter
  if (quality) {
    params.append("quality", quality.toString());
  }

  // Add dimensions if provided
  if (width) {
    params.append("fillWidth", width.toString());
  }

  if (height) {
    params.append("fillHeight", height.toString());
  }

  // Add image tag if available
  const imageTag = item.ImageTags?.Primary;
  if (imageTag) {
    params.append("tag", imageTag);
  }

  // For photos, use the secure Images endpoint
  if (item.Type === "Photo") {
    // Use the Images/Primary endpoint which supports session-based authentication
    // This avoids exposing the API key in the URL
    return `${api.basePath}/Items/${encodeURIComponent(item.Id ?? "")}/Images/Primary?${params.toString()}`;
  }

  // Fallback to standard Images/Primary endpoint
  return `${api.basePath}/Items/${encodeURIComponent(item.Id ?? "")}/Images/Primary?${params.toString()}`;
};
