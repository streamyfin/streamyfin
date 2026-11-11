import { useEffect, useRef } from "react";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { isSyncPlayAvailable } from "@/utils/syncplay/availability";

/**
 * Presents the native player when the group starts an item, whatever screen
 * is up. Mounted at the root so a launcher exists before any player has opened.
 */
export function SyncPlayPlaybackBridge() {
  const { registerLauncher } = useSyncPlay();
  const { presentFromRequest } = useNativePlayer();
  const latest = useRef(presentFromRequest);
  latest.current = presentFromRequest;

  useEffect(() => {
    if (!isSyncPlayAvailable()) return;
    return registerLauncher(async (request) => {
      if (request.isCurrent?.() === false) return;
      const presented = await latest.current(
        {
          itemId: request.itemId,
          playbackPositionTicks: request.startPositionTicks,
          offline: false,
        },
        { isCurrent: request.isCurrent },
      );
      if (!presented && request.isCurrent?.() !== false)
        throw new Error("Native SyncPlay player could not be presented");
    });
  }, [registerLauncher]);

  return null;
}
