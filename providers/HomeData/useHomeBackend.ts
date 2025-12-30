import { useMemo } from "react";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import { OfflineHomeDataBackend } from "./OfflineBackend";
import type { HomeSection } from "./types";

/**
 * Hook to get offline sections when in offline mode
 * Returns null when online (Home component uses its own live logic)
 */
export function useOfflineHomeSections(): HomeSection[] | null {
  const { offlineMode } = useOfflineLibrary();

  return useMemo(() => {
    if (!offlineMode) {
      return null; // Online - use live sections from Home component
    }

    const backend = new OfflineHomeDataBackend();
    const sections = backend.getDefaultSections();
    return sections;
  }, [offlineMode]);
}
