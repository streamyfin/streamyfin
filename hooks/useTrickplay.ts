import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useCallback, useMemo, useRef, useState } from "react";
import { DownloadedItem } from "@/providers/Downloads/types";
import {
  calculateTrickplayTile,
  generateTrickplayUrl,
  getTrickplayInfo,
} from "@/utils/trickplay";

interface TrickplayUrl {
  x: number;
  y: number;
  url: string;
}

export const useTrickplay = (
  item: BaseItemDto,
  downloadedItem?: DownloadedItem | null,
) => {
  const [trickPlayUrl, setTrickPlayUrl] = useState<TrickplayUrl | null>(null);
  const lastCalculationTime = useRef(0);
  const throttleDelay = 200;

  const trickplayInfo = useMemo(() => {
    return getTrickplayInfo(item);
  }, [item]);

  const calculateTrickplayUrl = useCallback(
    (progress: number) => {
      const now = Date.now();
      if (
        !trickplayInfo ||
        !item.Id ||
        now - lastCalculationTime.current < throttleDelay
      ) {
        return;
      }
      lastCalculationTime.current = now;

      const { sheetIndex, x, y } = calculateTrickplayTile(
        progress,
        trickplayInfo,
      );

      const url = generateTrickplayUrl(
        item.Id,
        trickplayInfo.resolution,
        sheetIndex,
        downloadedItem?.trickPlayData?.path,
      );

      if (url) {
        setTrickPlayUrl({ x, y, url });
      }
    },
    [trickplayInfo, item, throttleDelay, downloadedItem],
  );

  const prefetchAllTrickplayImages = useCallback(() => {
    if (!trickplayInfo || !item.Id) {
      return;
    }

    for (let index = 0; index < trickplayInfo.totalImageSheets; index++) {
      const url = generateTrickplayUrl(
        item.Id,
        trickplayInfo.resolution,
        index,
        downloadedItem?.trickPlayData?.path,
      );

      if (url) {
        Image.prefetch(url);
      }
    }
  }, [trickplayInfo, item, downloadedItem]);

  return {
    trickPlayUrl,
    calculateTrickplayUrl,
    prefetchAllTrickplayImages,
    trickplayInfo,
  };
};
