import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useGlobalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom } from "@/providers/JellyfinProvider";
import { store } from "@/utils/store";
import { ticksToMs } from "@/utils/time";

interface TrickplayUrl {
  x: number;
  y: number;
  url: string;
}

/** Hook to handle trickplay logic for a given item. */
export const useTrickplay = (item: BaseItemDto) => {
  const [trickPlayUrl, setTrickPlayUrl] = useState<TrickplayUrl | null>(null);
  const { getDownloadedItemById } = useDownload();
  const lastCalculationTime = useRef(0);
  const throttleDelay = 200;
  const isOffline = useGlobalSearchParams().offline === "true";
  const trickplayInfo = useMemo(() => getTrickplayInfo(item), [item]);

  /** Generates the trickplay URL for the given item and sheet index.
   * We change between offline and online trickplay URLs depending on the state of the app. */
  const getTrickplayUrl = useCallback(
    (item: BaseItemDto, sheetIndex: number) => {
      // If we are offline, we can use the downloaded item's trickplay data path
      const downloadedItem = getDownloadedItemById(item.Id!);
      if (isOffline && downloadedItem?.trickPlayData?.path) {
        return `${downloadedItem.trickPlayData.path}${sheetIndex}.jpg`;
      }
      return generateTrickplayUrl(item, sheetIndex);
    },
    [trickplayInfo],
  );

  /** Calculates the trickplay URL for the current progress. */
  const calculateTrickplayUrl = useCallback(
    (progress: number) => {
      const now = Date.now();
      if (
        !trickplayInfo ||
        !item.Id ||
        now - lastCalculationTime.current < throttleDelay
      )
        return;
      lastCalculationTime.current = now;
      const { sheetIndex, x, y } = calculateTrickplayTile(
        progress,
        trickplayInfo,
      );
      const url = getTrickplayUrl(item, sheetIndex);
      if (url) setTrickPlayUrl({ x, y, url });
    },
    [trickplayInfo, item, throttleDelay, getTrickplayUrl],
  );

  /** Prefetches all the trickplay images for the item. */
  const prefetchAllTrickplayImages = useCallback(() => {
    if (!trickplayInfo || !item.Id) return;
    for (let index = 0; index < trickplayInfo.totalImageSheets; index++) {
      const url = getTrickplayUrl(item, index);
      if (url) Image.prefetch(url);
    }
  }, [trickplayInfo, item, getTrickplayUrl]);

  return {
    trickPlayUrl,
    calculateTrickplayUrl,
    prefetchAllTrickplayImages,
    trickplayInfo,
  };
};

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

/** Generates a trickplay URL based on the item, resolution, and sheet index. */
export const generateTrickplayUrl = (item: BaseItemDto, sheetIndex: number) => {
  const api = store.get(apiAtom);
  const resolution = getTrickplayInfo(item)?.resolution;
  if (!resolution || !api) return null;
  return `${api.basePath}/Videos/${item.Id}/Trickplay/${resolution}/${sheetIndex}.jpg?api_key=${api.accessToken}`;
};

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

/**
 * Calculates the specific image sheet and tile offset for a given time.
 * @param progressTicks The current playback time in ticks.
 * @param trickplayInfo The parsed trickplay information object.
 * @returns An object with the image sheet index, and the X/Y coordinates for the tile.
 */
const calculateTrickplayTile = (
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
