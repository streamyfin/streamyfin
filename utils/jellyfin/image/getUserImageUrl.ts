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

  const params = new URLSearchParams({
    tag: primaryImageTag,
    quality: "90",
    width: String(width),
  });

  return `${serverAddress}/Users/${userId}/Images/Primary?${params.toString()}`;
};
