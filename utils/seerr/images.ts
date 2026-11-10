import {
  SEERR_IMAGE_QUALITY,
  SEERR_STILL_SIZE,
  SEERR_STILL_WIDTH,
} from "@/constants/Seerr";

const TMDB_IMAGES = "https://image.tmdb.org/";
// A TMDB image as Seerr 3 hands it over: the size, then the path.
const TMDB_IMAGE_URL = /^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+\/(.+)$/i;
// The other host Seerr's resizer takes (next.config.ts, remotePatterns).
const THETVDB_IMAGE_URL = /^https:\/\/artworks\.thetvdb\.com\//i;
const FULL_URL = /^https?:\/\//i;

/** An image through Seerr's resizer, the one Next.js serves. */
export const resizedImageUrl = (
  baseUrl: string,
  url: string,
  width: number,
  quality = SEERR_IMAGE_QUALITY,
): string =>
  `${baseUrl}/_next/image?${new URLSearchParams({
    url,
    w: `${width}`,
    q: `${quality}`,
  }).toString()}`;

/**
 * A TMDB image by its path, at one of TMDB's sizes, the way Seerr's own app loads it
 * (src/components/Common/CachedImage): through the server's image cache when its admin turned
 * caching on (cacheImages, in the public settings), from TMDB otherwise. None without a path:
 * the caller shows its own placeholder.
 */
export const tmdbImageUrl = (
  baseUrl: string,
  path: string | null | undefined,
  size: string,
  cacheImages: boolean,
): string | undefined => {
  if (!path) return undefined;
  const image = `t/p/${size}/${path.replace(/^\/+/, "")}`;
  return cacheImages
    ? `${baseUrl}/imageproxy/tmdb/${image}`
    : `${TMDB_IMAGES}${image}`;
};

/**
 * The URL of an episode still, at a thumbnail's size.
 *
 * Seerr sends a TMDB path, a TMDB URL to the full-size original since Seerr 3
 * (server/api/themoviedb/index.ts, getTvSeason), or a TheTVDB artwork URL
 * when the series' metadata comes from there (server/api/tvdb/index.ts).
 * TheTVDB has no smaller size, so its artwork goes through Seerr's resizer.
 */
export const episodeStillUrl = (
  baseUrl: string,
  still: string | null | undefined,
  cacheImages: boolean,
): string | undefined => {
  if (!still) return undefined;
  const tmdb = TMDB_IMAGE_URL.exec(still);
  if (tmdb) {
    return tmdbImageUrl(baseUrl, tmdb[1], SEERR_STILL_SIZE, cacheImages);
  }
  if (THETVDB_IMAGE_URL.test(still)) {
    return resizedImageUrl(baseUrl, still, SEERR_STILL_WIDTH);
  }
  if (FULL_URL.test(still)) return still;
  return tmdbImageUrl(baseUrl, still, SEERR_STILL_SIZE, cacheImages);
};
