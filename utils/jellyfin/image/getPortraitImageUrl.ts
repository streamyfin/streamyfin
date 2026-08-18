import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getPrimaryImageUrl } from "./getPrimaryImageUrl";

/**
 * Portrait (10:15) poster image for an item, as used by the poster cards.
 *
 * An episode has no poster of its own, so it borrows its series' primary
 * image — that is what a vertical row of episodes is expected to show.
 */
export const getPortraitImageUrl = ({
  api,
  item,
  width = 300,
}: {
  api?: Api | null;
  item?: BaseItemDto | null;
  width?: number;
}): string | undefined => {
  if (!api || !item) return undefined;

  if (item.Type === "Episode" && item.SeriesId) {
    return `${api.basePath}/Items/${item.SeriesId}/Images/Primary?fillHeight=389&quality=80&tag=${item.SeriesPrimaryImageTag}`;
  }

  return getPrimaryImageUrl({ api, item, width }) ?? undefined;
};
