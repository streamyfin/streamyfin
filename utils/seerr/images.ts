import {
  SEERR_IMAGE_QUALITY,
  SEERR_STILL_SIZE,
  SEERR_STILL_WIDTH,
} from "@/constants/Seerr";

const TMDB_IMAGES = "https://image.tmdb.org/t/p";
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
 * A TMDB image by its path, at one of TMDB's sizes, through Seerr's resizer.
 * None without a path: the caller shows its own placeholder.
 */
export const tmdbImageUrl = (
  baseUrl: string,
  path: string | null | undefined,
  {
    filter = "original",
    width = 1920,
    quality = SEERR_IMAGE_QUALITY,
  }: { filter?: string; width?: number; quality?: number } = {},
): string | undefined =>
  path
    ? resizedImageUrl(
        baseUrl,
        `${TMDB_IMAGES}/${filter}/${path}`,
        width,
        quality,
      )
    : undefined;

/**
 * The URL of an episode still, at a thumbnail's size.
 *
 * Seerr sends a TMDB path, a TMDB URL to the full-size original since Seerr 3
 * (server/api/themoviedb/index.ts, getTvSeason), or a TheTVDB artwork URL
 * when the series' metadata comes from there (server/api/tvdb/index.ts).
 */
export const episodeStillUrl = (
  baseUrl: string,
  still: string | null | undefined,
): string | undefined => {
  if (!still) return undefined;
  const thumbnail = { filter: SEERR_STILL_SIZE, width: SEERR_STILL_WIDTH };
  const tmdb = TMDB_IMAGE_URL.exec(still);
  if (tmdb) return tmdbImageUrl(baseUrl, tmdb[1], thumbnail);
  if (THETVDB_IMAGE_URL.test(still)) {
    return resizedImageUrl(baseUrl, still, SEERR_STILL_WIDTH);
  }
  if (FULL_URL.test(still)) return still;
  return tmdbImageUrl(baseUrl, still, thumbnail);
};
