import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { isNativePlayerSyncPlayAvailable } from "@/modules/mpv-player";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { toDirectPlayerQuery } from "@/utils/nativePlayer/playRequest";

/** Keeps a launcher available even before a player has been opened. */
export function SyncPlayPlaybackBridge() {
  const { registerLauncher } = useSyncPlay();
  const { presentFromRequest } = useNativePlayer();
  // This global launcher outlives player routes. Screen push guards would stay
  // locked after the first launch because the root never loses/regains focus.
  const router = useRouter();
  const pathname = usePathname();
  const routeRef = useRef({ router, pathname, presentFromRequest });
  routeRef.current = { router, pathname, presentFromRequest };

  useEffect(
    () =>
      registerLauncher(async (request) => {
        if (request.isCurrent?.() === false) return;
        // The presented SwiftUI/Compose player owns SyncPlay controls/timing.
        // Keep the route adapter only for platforms without the native module.
        if (isNativePlayerSyncPlayAvailable()) {
          if (routeRef.current.pathname.endsWith("/player/direct-player"))
            routeRef.current.router.back();
          const presented = await routeRef.current.presentFromRequest(
            {
              itemId: request.itemId,
              playbackPositionTicks: request.startPositionTicks,
              offline: false,
            },
            { isCurrent: request.isCurrent },
          );
          if (!presented && request.isCurrent?.() !== false)
            throw new Error("Native SyncPlay player could not be presented");
          return;
        }
        if (request.isCurrent?.() === false) return;
        const query = toDirectPlayerQuery({
          itemId: request.itemId,
          playbackPositionTicks: request.startPositionTicks,
          offline: false,
        });
        const current = routeRef.current;
        if (current.pathname.endsWith("/player/direct-player")) {
          current.router.setParams(
            Object.fromEntries(new URLSearchParams(query)),
          );
        } else {
          current.router.push(`/player/direct-player?${query}`);
        }
      }),
    [registerLauncher],
  );

  return null;
}
