// Imported from expo-router's bundled copy, NOT "@react-navigation/*": as of
// SDK 56 expo-router's Metro check rejects direct @react-navigation imports.
import { useRouter } from "expo-router";
import { NavigationContext } from "expo-router/react-navigation";
import { useCallback, useContext, useMemo } from "react";
import { useOfflineMode } from "@/providers/OfflineModeProvider";

/**
 * Drop-in replacement for expo-router's useRouter that automatically
 * preserves offline state across navigation and guards against duplicate
 * screens from rapid taps.
 *
 * - For object-form navigation, automatically adds offline=true when in offline context
 * - For string URLs, passes through unchanged (caller handles offline param)
 * - push() is a no-op while the source screen is not focused, so taps fired
 *   before the pushed screen has rendered (slow devices) can't stack duplicates
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

  // Optional: undefined when used outside a navigator (root layout, providers).
  // When present it reflects the focus state of the screen this hook lives in.
  const navigation = useContext(NavigationContext);

  const push = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      // Duplicate-screen guard: a push blurs the source screen synchronously in
      // the navigation state (only the native render is slow). A second tap then
      // sees an unfocused screen and is dropped. Resets automatically on return.
      // No navigation context => nothing to guard (deep-link pushes from root).
      if (navigation?.isFocused?.() === false) return;
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
    [router, isOffline, navigation],
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
