import { useSegments } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import {
  disableTVMenuKeyInterception,
  enableTVMenuKeyInterception,
} from "./useTVBackPress";

export { enableTVMenuKeyInterception } from "./useTVBackPress";

/**
 * Check if we're at the root of a tab
 */
function isAtTabRoot(segments: string[]): boolean {
  const lastSegment = segments[segments.length - 1];
  const tabNames = [
    "(home)",
    "(search)",
    "(favorites)",
    "(libraries)",
    "(watchlists)",
    "(settings)",
    "(custom-links)",
  ];
  return tabNames.includes(lastSegment) || lastSegment === "index";
}

/**
 * Get the current tab name from segments
 */
function getCurrentTab(segments: string[]): string | undefined {
  return segments.find(
    (s) =>
      s === "(home)" ||
      s === "(search)" ||
      s === "(favorites)" ||
      s === "(libraries)" ||
      s === "(watchlists)" ||
      s === "(settings)" ||
      s === "(custom-links)",
  );
}

/**
 * Keeps tvOS menu key interception disabled on the home tab root so the system
 * can apply its native app-exit behavior. Other routes can opt into
 * interception when they need JS-owned back handling.
 */
export function useTVHomeBackHandler() {
  const segments = useSegments();

  // Get current state
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
