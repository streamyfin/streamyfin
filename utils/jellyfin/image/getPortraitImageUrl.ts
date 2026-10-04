import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getPrimaryImageUrl } from "./getPrimaryImageUrl";

/**
 * Portrait (10:15) poster image for an item, as used by the poster cards.
 *
 * An episode has no poster of its own, so it borrows its series' primary
 * image — that is what a vertical row of episodes is expected to show.
 *
 * @param width - The image width in physical pixels, not layout points:
 *   convert with `toImagePixels`.
 */
export const getPortraitImageUrl = ({
  api,
  item,
  width,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  width: number;
}): string | undefined => {
  if (!api || !item) return undefined;

  if (item.Type === "Episode" && item.SeriesId) {
    // The same request the series' own card makes, so the two share one image.
    const params = new URLSearchParams({
      fillWidth: String(width),
      quality: "80",
    });
    if (item.SeriesPrimaryImageTag) {
      params.set("tag", item.SeriesPrimaryImageTag);
    }
    return `${api.basePath}/Items/${item.SeriesId}/Images/Primary?${params.toString()}`;
  }

  return getPrimaryImageUrl({ api, item, width }) ?? undefined;
};
