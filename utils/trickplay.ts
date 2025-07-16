import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { apiAtom } from "@/providers/JellyfinProvider";
import { store } from "./store";
import { ticksToMs } from "./time";

export interface TrickplayData {
  Interval?: number;
  TileWidth?: number;
  TileHeight?: number;
  Height?: number;
  Width?: number;
  ThumbnailCount?: number;
}

export interface TrickplayInfo {
  resolution: string;
  aspectRatio: number;
  data: TrickplayData;
  totalImageSheets: number;
}

/**
 * Parses the trickplay metadata from a BaseItemDto.
 * @param item The Jellyfin media item.
 * @returns Parsed trickplay information or null if not available.
 */
export const getTrickplayInfo = (item: BaseItemDto): TrickplayInfo | null => {
  if (!item.Id || !item.Trickplay) {
    return null;
  }

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

/**
 * Calculates the specific image sheet and tile offset for a given time.
 * @param progressTicks The current playback time in ticks.
 * @param trickplayInfo The parsed trickplay information object.
 * @returns An object with the image sheet index, and the X/Y coordinates for the tile.
 */
export const calculateTrickplayTile = (
  progressTicks: number,
  trickplayInfo: TrickplayInfo,
) => {
  const { data } = trickplayInfo;
  const { Interval, TileWidth, TileHeight } = data;

  if (!Interval || !TileWidth || !TileHeight) {
    throw new Error("Invalid trickplay data provided to calculateTile");
  }

  const currentTimeMs = Math.max(0, ticksToMs(progressTicks));
  const currentTile = Math.floor(currentTimeMs / Interval);

  const tilesPerSheet = TileWidth * TileHeight;
  const sheetIndex = Math.floor(currentTile / tilesPerSheet);
  const tileIndexInSheet = currentTile % tilesPerSheet;

  const x = tileIndexInSheet % TileWidth;
  const y = Math.floor(tileIndexInSheet / TileWidth);

  return { sheetIndex, x, y };
};

/**
 * Generates a trickplay URL based on the item ID, resolution, sheet index, and offline path.
 * @param itemId The ID of the media item.
 * @param resolution The resolution of the trickplay image.
 * @param sheetIndex The index of the image sheet.
 * @param offlinePath The path to the offline trickplay images.
 * @returns The URL of the trickplay image.
 */
export const generateTrickplayUrl = (
  itemId: string,
  resolution: string,
  sheetIndex: number,
  offlinePath?: string,
): string | null => {
  if (offlinePath) {
    return `${offlinePath}${sheetIndex}.jpg`;
  }
  const api = store.get(apiAtom);
  if (api) {
    return `${api.basePath}/Videos/${itemId}/Trickplay/${resolution}/${sheetIndex}.jpg?api_key=${api.accessToken}`;
  }
  return null;
};
