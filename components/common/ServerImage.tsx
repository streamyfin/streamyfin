import { Image, type ImageProps } from "expo-image";
import { useHeadersForUrl } from "@/hooks/useHeadersForUrl";

/**
 * Drop-in replacement for expo-image's <Image> when loading from a URI string.
 * Automatically injects the correct HTTP headers based on the URL:
 *   - Jellyfin server URLs  → Cloudflare / custom auth headers
 *   - Jellyseerr server URLs → Jellyseerr integration headers
 *   - External URLs (TMDB, etc.) → no headers
 *
 * Usage:
 *   <ServerImage uri={imageUrl} style={...} contentFit="cover" />
 */
export type ServerImageProps = Omit<ImageProps, "source"> & {
  uri?: string | null;
};

export function ServerImage({ uri, ...props }: ServerImageProps) {
  const headers = useHeadersForUrl(uri);
  if (!uri) return null;
  return <Image source={{ uri, headers }} {...props} />;
}
