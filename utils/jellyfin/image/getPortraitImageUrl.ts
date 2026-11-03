import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getPrimaryImageUrl } from "./getPrimaryImageUrl";
import { itemImageUrl } from "./itemImageUrl";

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
    return itemImageUrl(api, item.SeriesId, "Primary", {
      fillWidth: width,
      quality: 80,
      tag: item.SeriesPrimaryImageTag ?? undefined,
    });
  }

  return getPrimaryImageUrl({ api, item, width }) ?? undefined;
};
