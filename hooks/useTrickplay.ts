import { apiAtom } from "@/providers/JellyfinProvider";
import { ticksToMs } from "@/utils/time";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";

interface TrickplayData {
  Interval?: number;
  TileWidth?: number;
  TileHeight?: number;
  Height?: number;
  Width?: number;
  ThumbnailCount?: number;
}

interface TrickplayInfo {
  resolution: string;
  aspectRatio: number;
  data: TrickplayData;
}

interface TrickplayUrl {
  x: number;
  y: number;
  url: string;
}

export const useTrickplay = (item: BaseItemDto, enabled = true) => {
  const [api] = useAtom(apiAtom);
  const [trickPlayUrl, setTrickPlayUrl] = useState<TrickplayUrl | null>(null);
  const lastCalculationTime = useRef(0);
  const throttleDelay = 200; // 200ms throttle

  const trickplayInfo = useMemo(() => {
    if (!enabled || !item.Id || !item.Trickplay) {
      return null;
    }

    const mediaSourceId = item.Id;
    const trickplayData = item.Trickplay[mediaSourceId];

    if (!trickplayData) {
      return null;
    }

    // Get the first available resolution
    const firstResolution = Object.keys(trickplayData)[0];
    return firstResolution
      ? {
          resolution: firstResolution,
          aspectRatio:
            trickplayData[firstResolution].Width! /
            trickplayData[firstResolution].Height!,
          data: trickplayData[firstResolution],
        }
      : null;
  }, [item, enabled]);

  // Takes in ticks.
  const calculateTrickplayUrl = useCallback(
    (progress: number) => {
      if (!enabled) {
        return null;
      }

      const now = Date.now();
      if (now - lastCalculationTime.current < throttleDelay) {
        return null;
      }
      lastCalculationTime.current = now;

      if (!trickplayInfo || !api || !item.Id) {
        return null;
      }

      const { data, resolution } = trickplayInfo;
      const { Interval, TileWidth, TileHeight, Width, Height } = data;

      if (
        !Interval ||
        !TileWidth ||
        !TileHeight ||
        !resolution ||
        !Width ||
        !Height
      ) {
        throw new Error("Invalid trickplay data");
      }

      const currentTimeMs = Math.max(0, ticksToMs(progress));
      const currentTile = Math.floor(currentTimeMs / Interval);

      const tileSize = TileWidth * TileHeight;
      const tileOffset = currentTile % tileSize;
      const index = Math.floor(currentTile / tileSize);

      const tileOffsetX = tileOffset % TileWidth;
      const tileOffsetY = Math.floor(tileOffset / TileWidth);

      const newTrickPlayUrl = {
        x: tileOffsetX,
        y: tileOffsetY,
        url: `${api.basePath}/Videos/${item.Id}/Trickplay/${resolution}/${index}.jpg?api_key=${api.accessToken}`,
      };

      setTrickPlayUrl(newTrickPlayUrl);
      return newTrickPlayUrl;
    },
    [trickplayInfo, item, api, enabled],
  );

  const prefetchAllTrickplayImages = useCallback(() => {
    if (!api || !enabled || !trickplayInfo || !item.Id || !item.RunTimeTicks) {
      return;
    }

    const { data, resolution } = trickplayInfo;
    const { Interval, TileWidth, TileHeight, Width, Height } = data;

    if (
      !Interval ||
      !TileWidth ||
      !TileHeight ||
      !resolution ||
      !Width ||
      !Height
    ) {
      throw new Error("Invalid trickplay data");
    }

    // Calculate tiles per sheet
    const tilesPerRow = TileWidth;
    const tilesPerColumn = TileHeight;
    const tilesPerSheet = tilesPerRow * tilesPerColumn;
    const totalTiles = Math.ceil(ticksToMs(item.RunTimeTicks) / Interval);
    const totalIndexes = Math.ceil(totalTiles / tilesPerSheet);

    // Prefetch all trickplay images
    for (let index = 0; index < totalIndexes; index++) {
      const url = `${api.basePath}/Videos/${item.Id}/Trickplay/${resolution}/${index}.jpg?api_key=${api.accessToken}`;
      Image.prefetch(url);
    }
  }, [trickplayInfo, item, api, enabled]);

  return {
    trickPlayUrl: enabled ? trickPlayUrl : null,
    calculateTrickplayUrl: enabled ? calculateTrickplayUrl : () => null,
    prefetchAllTrickplayImages: enabled
      ? prefetchAllTrickplayImages
      : () => null,
    trickplayInfo: enabled ? trickplayInfo : null,
  };
};
