import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useServerVersion } from "@/hooks/useServerVersion";
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
): BaseItemDto | null | undefined =>
  useVersionItemState(item, mediaSources, mediaSourceId).versionItem;

/**
 * `useVersionItem`, plus whether the version item is still on its way.
 *
 * While it is, `versionItem` is the primary item standing in, so its resume
 * point and played state are another version's: a control that acts on them
 * (Play, the played toggle) waits. A request that failed is not pending, and
 * the primary's data is then all there is.
 */
export const useVersionItemState = (
  item: BaseItemDto | null | undefined,
  mediaSources: MediaSourceInfo[] | null | undefined,
  mediaSourceId: string | null | undefined,
): { versionItem: BaseItemDto | null | undefined; isPending: boolean } => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const offline = useOfflineMode();

  const serverVersion = useServerVersion({ enabled: !offline });

  const versionItemId = getVersionItemId(
    item,
    mediaSources,
    mediaSourceId,
    serverVersion,
    offline,
  );

  // Under ["item", id] so the played toggle's optimistic update and the
  // post-playback ["item"] invalidation both reach it.
  const { data: versionItem, isLoading } = useQuery({
    queryKey: ["item", versionItemId, "version"],
    queryFn: () =>
      getUserItemData({ api, itemId: versionItemId, userId: user?.Id }),
    enabled: !!api && !!user?.Id && !!versionItemId,
  });

  return {
    versionItem: versionItemId && versionItem ? versionItem : item,
    isPending: !!versionItemId && isLoading,
  };
};
