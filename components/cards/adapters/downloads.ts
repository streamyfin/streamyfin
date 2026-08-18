import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemProgressPercentage } from "@/components/common/ProgressBar";
import { storage } from "@/utils/mmkv";
import { type CardData, cardSubtitle } from "../CardData";

/**
 * Downloaded artwork lives in MMKV as raw base64, keyed by item id — there is
 * no server to ask when the device is offline. ServerImage resolves auth
 * headers by host, so a hostless data URI passes straight through to the image.
 */
const localArtwork = (id?: string | null): string | undefined => {
  if (!id) return undefined;
  const base64 = storage.getString(id);
  return base64 ? `data:image/jpeg;base64,${base64}` : undefined;
};

/**
 * Downloaded items → cards.
 *
 * Deliberately not `buildItemCards`: that one returns nothing without an API
 * and builds server image URLs, neither of which holds offline. The labels
 * still come from `cardSubtitle`, so a downloaded episode reads exactly like
 * the same episode online.
 */
export function buildDownloadedCards(items: BaseItemDto[]): CardData[] {
  return items.flatMap((item) => {
    if (!item.Id) return [];
    return [
      {
        id: item.Id,
        title: item.Name ?? "",
        subtitle: cardSubtitle(item),
        imageUrl: localArtwork(item.Id),
        progress: getItemProgressPercentage(item) / 100,
      },
    ];
  });
}

/**
 * Episodes grouped by series → one card per series, badged with how many
 * episodes are held locally. The card's id is the series id, since that is
 * what opening it navigates to.
 */
export function buildSeriesGroupCards(groups: BaseItemDto[][]): CardData[] {
  return groups.flatMap((episodes) => {
    const first = episodes[0];
    const seriesId = first?.SeriesId;
    if (!seriesId) return [];
    return [
      {
        id: seriesId,
        title: first.SeriesName ?? "",
        subtitle: first.ProductionYear ? String(first.ProductionYear) : null,
        imageUrl: localArtwork(seriesId),
        badgeLabel: String(episodes.length),
      },
    ];
  });
}
