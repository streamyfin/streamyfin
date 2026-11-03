import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { MediaType } from "@/utils/seerr/types";

/** What the Seerr detail page reads from its route params. */
export interface SeerrSeriesPageParams {
  id: string;
  mediaType: MediaType;
  mediaTitle: string;
  releaseYear: string;
  posterSrc: string;
  /** Opens the season picker on arrival; this entry point means "request". */
  autoRequest: "true";
}

/**
 * The Seerr page params for a library series, or undefined when Seerr has no
 * way to find it. Seerr keys a series by its TMDB id, so a series Jellyfin
 * never matched on TMDB has nothing to request against.
 */
export const seerrSeriesPageParams = ({
  item,
  posterSrc,
}: {
  item: BaseItemDto;
  posterSrc: string;
}): SeerrSeriesPageParams | undefined => {
  if (item.Type !== "Series") return undefined;

  const tmdbId = item.ProviderIds?.Tmdb?.trim();
  if (!tmdbId || !/^\d+$/.test(tmdbId)) return undefined;

  return {
    id: tmdbId,
    mediaType: MediaType.TV,
    mediaTitle: item.Name ?? "",
    releaseYear: item.ProductionYear?.toString() ?? "",
    posterSrc,
    autoRequest: "true",
  };
};
