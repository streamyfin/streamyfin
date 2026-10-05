import type {
  BaseItemDto,
  MediaSourceInfo,
  PublicSystemInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { SERVER_INFO_STALE_TIME_MS } from "@/constants/Jellyfin";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { getVersionItemId } from "@/utils/jellyfin/versionItem";

/**
 * The item whose UserData (resume point, progress, played state) belongs to
 * the selected version, like jellyfin-web's GET /Items/{selectedSourceId}.
 * Falls back to `item` until the version item loads or when it does not apply.
 * `mediaSources` are the item's versions; the item page's `item` lacks them.
 */
export const useVersionItem = (
  item: BaseItemDto | null | undefined,
  mediaSources: MediaSourceInfo[] | null | undefined,
  mediaSourceId: string | null | undefined,
): BaseItemDto | null | undefined => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const offline = useOfflineMode();

  // Same key and shape as the other consumers (useMediaPreferences).
  const { data: serverInfo } = useQuery({
    queryKey: ["jellyfin", "serverInfo"],
    queryFn: async (): Promise<PublicSystemInfo | null> => {
      if (!api) return null;
      return (await getSystemApi(api).getPublicSystemInfo()).data;
    },
    enabled: !!api && !offline,
    staleTime: SERVER_INFO_STALE_TIME_MS,
  });

  const versionItemId = getVersionItemId(
    item,
    mediaSources,
    mediaSourceId,
    serverInfo?.Version,
    offline,
  );

  // Under ["item", id] so the played toggle's optimistic update and the
  // post-playback ["item"] invalidation both reach it.
  const { data: versionItem } = useQuery({
    queryKey: ["item", versionItemId, "version"],
    queryFn: () =>
      getUserItemData({ api, itemId: versionItemId, userId: user?.Id }),
    enabled: !!api && !!user?.Id && !!versionItemId,
  });

  return versionItemId && versionItem ? versionItem : item;
};
