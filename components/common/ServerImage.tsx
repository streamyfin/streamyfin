import {
  Image as ExpoImage,
  type ImagePrefetchOptions,
  type ImageProps,
  type ImageSource,
} from "expo-image";
import { useMemo } from "react";
import { useHeadersForUrl } from "@/hooks/useHeadersForUrl";
import {
  getHeadersForUrl,
  getJellyfinHeadersForUrl,
  optionsWithOptionalHeaders,
} from "@/utils/customHeaders";

function ServerImage({ source, ...props }: ImageProps) {
  const objectSource =
    source && !Array.isArray(source) && typeof source === "object"
      ? (source as ImageSource)
      : undefined;
  const uri = typeof source === "string" ? source : objectSource?.uri;

  // A source built by getItemImage already carries them; resolving again would
  // give two answers for the same image.
  const resolvedHeaders = useHeadersForUrl(
    objectSource?.headers ? undefined : uri,
  );

  const sourceWithHeaders = useMemo(() => {
    if (!resolvedHeaders || !uri) return source;
    return typeof source === "string"
      ? { uri: source, headers: resolvedHeaders }
      : { ...(source as ImageSource), headers: resolvedHeaders };
  }, [source, uri, resolvedHeaders]);

  return <ExpoImage source={sourceWithHeaders} {...props} />;
}

/**
 * `Image.prefetch` with the headers configured for the Jellyfin server, so a
 * warm cache still works behind an access gateway.
 */
export async function prefetchServerImage(
  uri: string,
  jellyfinBaseUrl: string | null | undefined,
  cachePolicy: ImagePrefetchOptions["cachePolicy"] = "memory-disk",
): Promise<boolean> {
  const headers = getJellyfinHeadersForUrl(uri, jellyfinBaseUrl);
  return ExpoImage.prefetch(
    uri,
    headers ? { cachePolicy, headers } : { cachePolicy },
  );
}

/**
 * Drop-in replacement for expo-image's `<Image>` that attaches the custom proxy
 * auth headers configured for the server the image is hosted on (Cloudflare
 * Access, Pangolin, ...). Sources that don't belong to a configured server —
 * TMDB artwork, bundled assets, data URIs — are passed through untouched.
 *
 * Import this instead of `expo-image` for anything loaded from the Jellyfin or
 * Jellyseerr server; the props are expo-image's and its statics are carried
 * over, so only the import changes:
 *
 *     import { Image } from "@/components/common/ServerImage";
 *
 * `prefetch` is the one that behaves differently: it resolves the headers for
 * each URL, which the plain expo-image one cannot do.
 */
export const Image = Object.assign(ServerImage, {
  Image: ExpoImage.Image,
  clearDiskCache: ExpoImage.clearDiskCache,
  clearMemoryCache: ExpoImage.clearMemoryCache,
  configureCache: ExpoImage.configureCache,
  generateBlurhashAsync: ExpoImage.generateBlurhashAsync,
  generateThumbhashAsync: ExpoImage.generateThumbhashAsync,
  getCachePathAsync: ExpoImage.getCachePathAsync,
  loadAsync: ExpoImage.loadAsync,
  readFromCacheAsync: ExpoImage.readFromCacheAsync,
  writeToCacheAsync: ExpoImage.writeToCacheAsync,
  prefetch: async (
    urls: string | string[],
    options?: ImagePrefetchOptions,
  ): Promise<boolean> => {
    const results = await Promise.all(
      (Array.isArray(urls) ? urls : [urls]).map((url) =>
        ExpoImage.prefetch(
          url,
          optionsWithOptionalHeaders(options ?? {}, getHeadersForUrl(url, {})),
        ),
      ),
    );
    return results.every(Boolean);
  },
});
