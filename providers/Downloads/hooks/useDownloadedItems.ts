import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { getAllDownloadedItems } from "../database";
import type { DownloadedItem } from "../types";

/**
 * Reads the downloaded items, and reads them again whenever `refreshKey`
 * changes. The storage read and JSON parse run a tick after mount, so a launch
 * that never shows downloaded content does not pay for them inside the
 * provider's first render. Consumers get `[]` until that tick. TV never reads:
 * downloads do not exist there.
 */
export const useDownloadedItems = (refreshKey: number): DownloadedItem[] => {
  const [downloadedItems, setDownloadedItems] = useState<DownloadedItem[]>([]);
  const [readError, setReadError] = useState<{ error: unknown } | null>(null);

  useEffect(() => {
    if (Platform.isTV) return;
    const timer = setTimeout(() => {
      try {
        setDownloadedItems(getAllDownloadedItems());
      } catch (error) {
        setReadError({ error });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshKey]);

  // A damaged index must reach the root error boundary as it did when the read
  // ran in render. Thrown from the timer, it bypasses every boundary.
  if (readError) throw readError.error;

  return downloadedItems;
};
