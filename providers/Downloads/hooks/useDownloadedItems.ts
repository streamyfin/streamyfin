import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { getAllDownloadedItems } from "../database";
import type { DownloadedItem } from "../types";

const NO_ITEMS: DownloadedItem[] = [];

/**
 * Reads the downloaded items, and reads them again whenever `refreshKey`
 * changes. Only the first read waits: it runs a tick after mount, outside the
 * provider's first render, and consumers get `[]` until then. Every later read
 * runs in the render that brings the new key, so a refresh commits once, with
 * the key and the list in step. TV never reads: downloads do not exist there.
 */
export const useDownloadedItems = (refreshKey: number): DownloadedItem[] => {
  const [firstReadDue, setFirstReadDue] = useState(false);

  useEffect(() => {
    if (Platform.isTV) return;
    const timer = setTimeout(() => setFirstReadDue(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // refreshKey is the signal to read again. Read in render, a damaged index
  // throws to the nearest error boundary.
  return useMemo(
    () => (firstReadDue ? getAllDownloadedItems() : NO_ITEMS),
    [firstReadDue, refreshKey],
  );
};
