import { useEffect, useRef } from "react";
import useRouter from "@/hooks/useAppRouter";

/**
 * Goes back, once, when what the screen was showing no longer exists: the
 * offline series page after its last downloaded episode is deleted, say.
 * Staying would leave an empty screen that has to be closed by hand.
 *
 * Lives outside the route file so it can be tested: a spec next to a route
 * would be picked up by Expo Router as a route of its own.
 */
export const useLeaveWhenGone = (gone: boolean) => {
  const router = useRouter();
  // The screen keeps rendering until the navigation lands, and `router` is
  // not guaranteed to keep its identity; one departure is enough.
  const hasLeft = useRef(false);

  useEffect(() => {
    if (!gone || hasLeft.current) return;
    hasLeft.current = true;
    router.back();
  }, [gone, router]);
};
