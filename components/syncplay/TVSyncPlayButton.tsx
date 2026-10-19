import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { TVButton } from "@/components/tv/TVButton";
import { useSyncPlaySheet } from "@/hooks/useSyncPlaySheet";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { scaleSize } from "@/utils/scaleSize";
import { syncPlayQueueIds } from "@/utils/syncplay/queueItems";

interface Props {
  /** What this page shows: a video, or the episodes of a season or show. */
  items: (BaseItemDto | null | undefined)[];
  title?: string | null;
}

/**
 * The TV entry to SyncPlay, in the action row of a page: the header button
 * of the phone (SyncPlayButton), filled while in a group. Sized as its
 * neighbours in the row.
 */
export function TVSyncPlayButton({ items, title }: Props) {
  const openSyncPlay = useSyncPlaySheet();
  const { group, available } = useSyncPlay();

  if (!available) return null;
  return (
    <TVButton
      variant='glass'
      square
      onPress={() => {
        const ids = syncPlayQueueIds(items);
        openSyncPlay(ids.length ? { ids, title: title ?? "" } : undefined);
      }}
    >
      <Ionicons
        name={group ? "people" : "people-outline"}
        size={scaleSize(28)}
        color='#FFFFFF'
      />
    </TVButton>
  );
}
