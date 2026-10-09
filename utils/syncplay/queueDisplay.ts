import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { SYNCPLAY_QUEUE_POSTER_WIDTH } from "@/constants/SyncPlay";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { toImagePixels } from "@/utils/jellyfin/image/imagePixels";

const episodeNumber = (item: BaseItemDto) =>
  item.ParentIndexNumber != null && item.IndexNumber != null
    ? `S${item.ParentIndexNumber}:E${item.IndexNumber}`
    : null;

/** Under a queue row's title: the series for an episode, the year for a film. */
export const syncPlayQueueSubtitle = (item: BaseItemDto): string =>
  item.Type === "Episode"
    ? [item.SeriesName, episodeNumber(item)].filter(Boolean).join(" · ")
    : item.ProductionYear
      ? String(item.ProductionYear)
      : "";

/** A queue row's poster. An episode's own image is a wide still, so it shows its series. */
export const syncPlayQueuePosterUrl = (
  api: Api | null | undefined,
  item: BaseItemDto | undefined,
): string | null =>
  getPrimaryImageUrl({
    api,
    item:
      item?.Type === "Episode" && item.SeriesId ? { Id: item.SeriesId } : item,
    width: toImagePixels(SYNCPLAY_QUEUE_POSTER_WIDTH),
  });
