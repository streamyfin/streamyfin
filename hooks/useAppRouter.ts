import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

const NAVIGATION_DEBOUNCE_MS = 500;

/**
 * Drop-in replacement for expo-router's useRouter that automatically
 * preserves offline state across navigation.
 *
 * - For object-form navigation, automatically adds offline=true when in offline context
 * - For string URLs, passes through unchanged (caller handles offline param)
 *
 * @example
 * import useRouter from "@/hooks/useAppRouter";
 *
 * const router = useRouter();
 * router.push({ pathname: "/items/page", params: { id: item.Id } }); // offline added automatically
 */
export function useAppRouter() {
  const router = useRouter();
  const isOffline = useOfflineMode();
  const isNavigatingRef = useRef(false);

  const push = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, NAVIGATION_DEBOUNCE_MS);

      if (typeof href === "string") {
        router.push(href as any);
      } else {
        const callerParams = (href.params ?? {}) as Record<string, unknown>;
        const hasExplicitOffline = "offline" in callerParams;
        router.push({
          ...href,
          params: {
            // Only add offline if caller hasn't explicitly set it
            ...(isOffline && !hasExplicitOffline && { offline: "true" }),
            ...callerParams,
          },
        } as any);
      }
    },
    [router, isOffline],
  );

  const replace = useCallback(
    (href: Parameters<typeof router.replace>[0]) => {
      if (typeof href === "string") {
        router.replace(href as any);
      } else {
        const callerParams = (href.params ?? {}) as Record<string, unknown>;
        const hasExplicitOffline = "offline" in callerParams;
        router.replace({
          ...href,
          params: {
            // Only add offline if caller hasn't explicitly set it
            ...(isOffline && !hasExplicitOffline && { offline: "true" }),
            ...callerParams,
          },
        } as any);
      }
    },
    [router, isOffline],
  );

  const setParams = useCallback(
    (params: Parameters<typeof router.setParams>[0]) => {
      const callerParams = (params ?? {}) as Record<string, unknown>;
      const hasExplicitOffline = "offline" in callerParams;
      router.setParams({
        // Only add offline if caller hasn't explicitly set it
        ...(isOffline && !hasExplicitOffline && { offline: "true" }),
        ...callerParams,
      });
    },
    [router, isOffline],
  );

  return useMemo(
    () => ({
      ...router,
      push,
      replace,
      setParams,
    }),
    [router, push, replace, setParams],
  );
}

export default useAppRouter;
