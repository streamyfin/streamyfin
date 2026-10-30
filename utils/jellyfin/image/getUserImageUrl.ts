import { Configuration } from "@jellyfin/sdk/lib/generated-client/configuration";
import { ImageUrlsApi } from "@jellyfin/sdk/lib/utils/api/image-urls-api";

/**
 * Retrieves the profile image URL for a Jellyfin user.
 *
 * @param serverAddress - The Jellyfin server base URL.
 * @param userId - The user's ID.
 * @param primaryImageTag - The user's primary image tag (required for the image to exist).
 * @param width - The desired image width (default: 280).
 * @returns The image URL or null if no image tag is provided.
 */
export const getUserImageUrl = ({
  serverAddress,
  userId,
  primaryImageTag,
  width = 280,
}: {
  serverAddress: string;
  userId: string;
  primaryImageTag?: string | null;
  width?: number;
}): string | null => {
  if (!primaryImageTag) {
    return null;
  }

  // Login can display public user images before an authenticated Api exists.
  const images = new ImageUrlsApi(
    new Configuration({ basePath: serverAddress }),
  );
  return (
    images.getUserImageUrl(
      { Id: userId, PrimaryImageTag: primaryImageTag },
      { quality: 90, width },
    ) ?? null
  );
};
