import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { apiAtom } from "@/providers/JellyfinProvider";
import { store } from "@/utils/store";
import { ticksToMs } from "@/utils/time";

export interface TrickplayInfo {
  resolution: string;
  aspectRatio: number;
  data: any;
  totalImageSheets: number;
}

/**
 * Parses the trickplay metadata from a BaseItemDto.
 * @param item The Jellyfin media item.
 * @returns Parsed trickplay information or null if not available.
 */
export const getTrickplayInfo = (item: BaseItemDto): TrickplayInfo | null => {
  if (!item.Id || !item.Trickplay) return null;

  const mediaSourceId = item.Id;
  const trickplayDataForSource = item.Trickplay[mediaSourceId];

  if (!trickplayDataForSource) {
    return null;
  }

  const firstResolution = Object.keys(trickplayDataForSource)[0];
  if (!firstResolution) {
    return null;
  }

  const data = trickplayDataForSource[firstResolution];
  const { Interval, TileWidth, TileHeight, Width, Height } = data;

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
  const totalTiles = Math.ceil(ticksToMs(item.RunTimeTicks) / Interval);
  const totalImageSheets = Math.ceil(totalTiles / tilesPerSheet);

  return {
    resolution: firstResolution,
    aspectRatio: Width / Height,
    data,
    totalImageSheets,
  };
};

/** Generates a trickplay URL based on the item, resolution, and sheet index. */
export const generateTrickplayUrl = (item: BaseItemDto, sheetIndex: number) => {
  const api = store.get(apiAtom);
  const resolution = getTrickplayInfo(item)?.resolution;
  if (!resolution || !api) return null;
  return `${api.basePath}/Videos/${item.Id}/Trickplay/${resolution}/${sheetIndex}.jpg?api_key=${api.accessToken}`;
};
