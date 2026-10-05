import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { isAlternateVersion } from "@/utils/jellyfin/mediaSourceVersion";
import { ticksToMs } from "@/utils/time";

export interface TrickplayInfo {
  /** The media source the sheets belong to, see getTrickplayInfo. */
  sourceId: string;
  resolution: string;
  aspectRatio: number;
  data: any;
  totalImageSheets: number;
}

/**
 * Parses the trickplay metadata from a BaseItemDto.
 * @param item The Jellyfin media item.
 * @param mediaSourceId The playing version. `Trickplay` is keyed by media
 * source ID, so an alternate version has its own thumbnails; defaults to the
 * primary version, whose source ID is the item ID. A source that is not a
 * version (a plugin stream) and has no entry of its own uses the item's.
 * @returns Parsed trickplay information or null if not available.
 */
export const getTrickplayInfo = (
  item: BaseItemDto,
  mediaSourceId?: string | null,
): TrickplayInfo | null => {
  if (!item.Id || !item.Trickplay) return null;

  const sourceId =
    mediaSourceId &&
    (item.Trickplay[mediaSourceId] ||
      isAlternateVersion(item.Id, item.MediaSources, mediaSourceId))
      ? mediaSourceId
      : item.Id;
  const trickplayDataForSource = item.Trickplay[sourceId];

  if (!trickplayDataForSource) {
    return null;
  }

  const firstResolution = Object.keys(trickplayDataForSource)[0];
  if (!firstResolution) {
    return null;
  }

  const data = trickplayDataForSource[firstResolution];
  const { Interval, TileWidth, TileHeight, Width, Height, ThumbnailCount } =
    data;

  if (
    !Interval ||
    !TileWidth ||
    !TileHeight ||
    !Width ||
    !Height ||
    !item.RunTimeTicks
  ) {
    return null;
  }

  const tilesPerSheet = TileWidth * TileHeight;
  // RunTimeTicks is the primary version's, and another cut can run longer or
  // shorter, so an alternate version counts its own thumbnails.
  const totalTiles =
    sourceId !== item.Id && ThumbnailCount
      ? ThumbnailCount
      : Math.ceil(ticksToMs(item.RunTimeTicks) / Interval);
  const totalImageSheets = Math.ceil(totalTiles / tilesPerSheet);

  return {
    sourceId,
    resolution: firstResolution,
    aspectRatio: Width / Height,
    data,
    totalImageSheets,
  };
};

/**
 * URL of one trickplay sheet. The server serves the primary version's sheets
 * unless MediaSourceId names another one.
 */
export const trickplaySheetUrl = (
  api: Api,
  itemId: string,
  resolution: string,
  sheetIndex: number,
  mediaSourceId?: string | null,
) => {
  const version =
    mediaSourceId && mediaSourceId !== itemId
      ? `&MediaSourceId=${mediaSourceId}`
      : "";
  return `${api.basePath}/Videos/${itemId}/Trickplay/${resolution}/${sheetIndex}.jpg?ApiKey=${api.accessToken}${version}`;
};

/** Generates a trickplay URL based on the item, resolution, and sheet index. */
export const generateTrickplayUrl = (
  item: BaseItemDto,
  sheetIndex: number,
  api: Api | null,
  mediaSourceId?: string | null,
) => {
  const info = getTrickplayInfo(item, mediaSourceId);
  if (!info || !api || !item.Id) return null;
  return trickplaySheetUrl(
    api,
    item.Id,
    info.resolution,
    sheetIndex,
    info.sourceId,
  );
};
