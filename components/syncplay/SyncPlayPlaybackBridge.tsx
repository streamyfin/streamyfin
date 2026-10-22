import { router, usePathname } from "expo-router";
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
  const pathname = usePathname();
  const latest = useRef({ pathname, presentFromRequest });
  latest.current = { pathname, presentFromRequest };

  useEffect(() => {
    if (!isSyncPlayAvailable()) return;
    return registerLauncher(async (request) => {
      if (request.isCurrent?.() === false) return;
      // The JS player does not follow the group. One that is still open (Live
      // TV started while in a group) would keep playing under the native one.
      // Static router: a provider level useRouter() disturbs the native tabs.
      if (latest.current.pathname.endsWith("/player/direct-player"))
        router.back();
      const presented = await latest.current.presentFromRequest(
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
