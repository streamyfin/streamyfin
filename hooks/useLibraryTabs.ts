import type {
  BaseItemDto,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { Platform } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  getLibraryContainerTabs,
  getLibraryTabQuery,
  getVisibleLibraryTabs,
  type LibraryTab,
} from "@/utils/library/libraryTabs";

const TAB_COUNT_STALE_TIME = 60 * 1000;

/**
 * The Items / Collections / Playlists tabs of a library screen: which ones the
 * server and the library type allow, which of those hold anything, and the one
 * that is selected.
 */
export function useLibraryTabs(library: BaseItemDto | null | undefined) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  // The selection belongs to the library it was made for: the screen can be
  // handed another library, which opens on its own items.
  const [selection, setSelection] = useState<{
    libraryId?: string;
    tab: LibraryTab;
  }>({ tab: "items" });
  const selectedTab =
    selection.libraryId === library?.Id ? selection.tab : "items";
  const setActiveTab = useCallback(
    (tab: LibraryTab) => setSelection({ libraryId: library?.Id, tab }),
    [library?.Id],
  );

  // Kept aligned with the other consumers of this key (useMediaPreferences,
  // useWatchlists): same shape, same nullable contract.
  const { data: serverInfo } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api,
    staleTime: 43200000, // 12 hours
  });

  const containerTabs = useMemo(
    () =>
      library ? getLibraryContainerTabs(library, serverInfo?.Version) : [],
    [library, serverInfo?.Version],
  );

  const tabs = useQueries({
    queries: containerTabs.map((tab) => ({
      // Under "library-items" so a LibraryChanged event refreshes the counts
      // along with the grid.
      queryKey: ["library-items", library?.Id, "tab-count", tab, user?.Id],
      queryFn: async (): Promise<number> => {
        if (!api || !library) return 0;
        const response = await getItemsApi(api).getItems({
          userId: user?.Id,
          parentId: library.Id,
          recursive: true,
          // One item is enough: only the total is read.
          limit: 1,
          enableTotalRecordCount: true,
          enableUserData: false,
          enableImages: false,
          ...getLibraryTabQuery(tab, library, Platform.isTV),
        });
        return (
          response.data.TotalRecordCount ?? response.data.Items?.length ?? 0
        );
      },
      enabled: !!api && !!user?.Id && !!library?.Id,
      staleTime: TAB_COUNT_STALE_TIME,
    })),
    combine: (counts) =>
      getVisibleLibraryTabs(
        containerTabs,
        Object.fromEntries(
          containerTabs.map((tab, index) => [tab, counts[index]?.data]),
        ),
      ),
  });

  return {
    tabs,
    // A tab can empty out while it is selected, when its last collection is
    // deleted for instance: the selection then falls back to the items.
    activeTab: tabs.includes(selectedTab) ? selectedTab : "items",
    setActiveTab,
  };
}
