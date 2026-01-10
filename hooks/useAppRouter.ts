import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

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

  const push = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      if (typeof href === "string") {
        router.push(href as any);
      } else {
        router.push({
          ...href,
          params: {
            ...(isOffline && { offline: "true" }),
            ...href.params, // Caller's params take priority
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
        router.replace({
          ...href,
          params: {
            ...(isOffline && { offline: "true" }),
            ...href.params, // Caller's params take priority
          },
        } as any);
      }
    },
    [router, isOffline],
  );

  const setParams = useCallback(
    (params: Parameters<typeof router.setParams>[0]) => {
      router.setParams({
        ...(isOffline && { offline: "true" }),
        ...params, // Caller's params take priority
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
