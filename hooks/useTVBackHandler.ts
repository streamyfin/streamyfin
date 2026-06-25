import { useSegments } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import {
  disableTVMenuKeyInterception,
  enableTVMenuKeyInterception,
  useTVBackPress,
} from "./useTVBackPress";

export { enableTVMenuKeyInterception } from "./useTVBackPress";

/** All tab route names used in the bottom tab navigator. */
export const TAB_ROUTES = [
  "(home)",
  "(search)",
  "(favorites)",
  "(libraries)",
  "(watchlists)",
  "(custom-links)",
  "(settings)",
] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

/** Check if a segment string is a tab route. */
export function isTabRoute(s: string): s is TabRoute {
  return (TAB_ROUTES as readonly string[]).includes(s);
}

/**
 * Check if we're at the root of a tab
 */
function isAtTabRoot(segments: string[]): boolean {
  const lastSegment = segments[segments.length - 1];
  return isTabRoute(lastSegment) || lastSegment === "index";
}

/**
 * Get the current tab name from segments
 */
function getCurrentTab(segments: string[]): TabRoute | undefined {
  return segments.find(isTabRoute);
}

/**
 * Keeps tvOS menu key interception disabled on the home tab root so the system
 * can apply its native app-exit behavior. Other routes can opt into
 * interception when they need JS-owned back handling.
 */
export function useTVHomeBackHandler() {
  const segments = useSegments();

  const currentTab = getCurrentTab(segments);
  const atTabRoot = isAtTabRoot(segments);
  const isOnHomeRoot = atTabRoot && currentTab === "(home)";

  useEffect(() => {
    if (!Platform.isTV) return;

    if (isOnHomeRoot) {
      disableTVMenuKeyInterception();
      return;
    }

    enableTVMenuKeyInterception();
  }, [isOnHomeRoot]);
}

/**
 * Handles back press at a non-Home tab root on Android TV by navigating to Home.
 *
 * Without NativeTabs, the Stack navigator used for the Android TV nav bar has no
 * built-in tab-level back handling — pressing back at a tab root would pop the
 * Stack entirely and exit the tab navigator. This hook intercepts that and routes
 * to Home instead.
 */
export function useTVTabRootBackHandler(
  onNavigateHome: () => void,
  isAtTabRoot: boolean,
  currentTab: string | undefined,
) {
  useTVBackPress(() => {
    if (!Platform.isTV || Platform.OS !== "android") return false;
    if (!isAtTabRoot || currentTab === "(home)") return false;
    onNavigateHome();
    return true;
  }, [isAtTabRoot, currentTab, onNavigateHome]);
}
