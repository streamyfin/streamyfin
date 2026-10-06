import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useState } from "react";
import { useSyncPlay } from "@/providers/SyncPlayProvider";

/**
 * The videos behind the group's queue, by media id. The queue itself only
 * carries ids: titles and posters come from the library.
 */
export function useSyncPlayQueueItems() {
  const { playlist, connected, resolveVideos } = useSyncPlay();
  const [items, setItems] = useState<Record<string, BaseItemDto>>({});
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const ids = playlist.map((entry) => entry.ItemId).join(",");

  useEffect(() => {
    let active = true;
    if (!ids) setItems({});
    setFailed(false);
    if (ids && connected) {
      void resolveVideos(ids.split(","))
        .then((resolved) => {
          if (active)
            setItems(
              Object.fromEntries(resolved.map((item) => [item.Id, item])),
            );
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    }
    return () => {
      active = false;
    };
  }, [ids, connected, resolveVideos, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { items, failed, retry };
}
