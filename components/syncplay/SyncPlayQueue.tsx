import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
  DraggableQueueList,
  type QueueRow,
} from "@/components/common/DraggableQueueList";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import {
  syncPlayQueuePosterUrl,
  syncPlayQueueSubtitle,
} from "@/utils/syncplay/queueDisplay";
import type { SyncPlayQueueItem } from "@/utils/syncplay/types";

/**
 * The group's queue in the music player's layout: poster, title, drag to
 * reorder, X to remove, tap to play. The server owns the order: a drag is a
 * request, shown at once and corrected by the answer.
 */
export function SyncPlayQueue({
  items,
  onDragActiveChange,
}: {
  items: Record<string, BaseItemDto>;
  /** See DraggableQueueList: the sheet around this stops scrolling meanwhile. */
  onDragActiveChange?: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const sync = useSyncPlay();
  const { group, connected, busy, playlist, currentPlaylistItemId } = sync;
  const [dragged, setDragged] = useState<SyncPlayQueueItem[] | null>(null);
  const disabled = !group || !connected || busy;

  // Whatever the server says replaces the order a drag left on screen.
  useEffect(() => {
    setDragged(null);
  }, [playlist]);

  const entries = dragged ?? playlist;
  const rows = useMemo<QueueRow[]>(
    () =>
      entries.map((entry) => {
        const item = items[entry.ItemId];
        return {
          key: entry.PlaylistItemId,
          title: item?.Name || t("syncplay.unavailable_video"),
          subtitle: item ? syncPlayQueueSubtitle(item) : undefined,
          imageUrl: syncPlayQueuePosterUrl(api, item),
        };
      }),
    [entries, items, api, t],
  );

  const move = useCallback(
    (from: number, to: number) => {
      const next = [...entries];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setDragged(next);
      void sync
        .movePlaylistItem(moved.PlaylistItemId, to)
        // A refused move sends no queue update to put the row back.
        .catch(() =>
          setDragged((current) => (current === next ? null : current)),
        );
    },
    [entries, sync.movePlaylistItem],
  );

  if (!group) return null;

  return (
    <View>
      <Text className='ml-4 mb-1 uppercase text-[#8E8D91] text-xs'>
        {t("syncplay.queue")}
      </Text>
      <View className='rounded-xl overflow-hidden'>
        <DraggableQueueList
          testID='syncplay-queue'
          rows={rows}
          currentIndex={entries.findIndex(
            (entry) => entry.PlaylistItemId === currentPlaylistItemId,
          )}
          artwork='poster'
          icon='film'
          emptyText={t("syncplay.empty_queue")}
          // The sheet around this scrolls.
          scrollable={false}
          disabled={disabled}
          canRemoveCurrent
          onPressRow={(index) =>
            void sync
              .requestPlaylistItem(entries[index].PlaylistItemId)
              .catch(() => {})
          }
          onRemoveRow={(index) =>
            void sync
              .removePlaylistItems([entries[index].PlaylistItemId])
              .catch(() => {})
          }
          onMoveRow={move}
          onDragActiveChange={onDragActiveChange}
        />
      </View>
    </View>
  );
}
