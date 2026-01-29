import { useNavigation } from "@react-navigation/native";
import { router, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

// TV event handler and control with fallback for non-TV platforms
let useTVEventHandler: (callback: (evt: any) => void) => void;
let TVEventControl: {
  enableTVMenuKey: () => void;
  disableTVMenuKey: () => void;
} | null = null;

if (Platform.isTV) {
  try {
    useTVEventHandler = require("react-native").useTVEventHandler;
    TVEventControl = require("react-native").TVEventControl;
  } catch {
    useTVEventHandler = () => {};
  }
} else {
  useTVEventHandler = () => {};
}

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
 * Hook to handle TV back/menu button presses.
 *
 * Behavior:
 * - On home tab at root: allows app to exit (default tvOS behavior)
 * - On other tabs at root: navigates to home tab
 * - Deeper in navigation stack: goes back
 */
export function useTVBackHandler() {
  const navigation = useNavigation<any>();
  const segments = useSegments();
  const lastMenuKeyState = useRef<boolean | null>(null);

  // Get current state
  const currentTab = getCurrentTab(segments);
  const atTabRoot = isAtTabRoot(segments);
  const isOnHomeRoot = atTabRoot && currentTab === "(home)";

  // Toggle menu key interception based on current location
  useEffect(() => {
    if (!Platform.isTV || !TVEventControl) return;

    if (isOnHomeRoot) {
      // On home tab root - disable interception to allow app exit
      if (lastMenuKeyState.current !== false) {
        console.log("[useTVBackHandler] On home root - enabling app exit");
        TVEventControl.disableTVMenuKey();
        lastMenuKeyState.current = false;
      }
    } else {
      // On other screens - enable interception to handle navigation
      if (lastMenuKeyState.current !== true) {
        console.log("[useTVBackHandler] Not on home - intercepting menu key");
        TVEventControl.enableTVMenuKey();
        lastMenuKeyState.current = true;
      }
    }
  }, [isOnHomeRoot]);

  // Handle TV remote menu/back button events
  useTVEventHandler((evt) => {
    if (!evt) return;
    if (evt.eventType === "menu" || evt.eventType === "back") {
      // If on home root, let the default behavior happen (app exit)
      // This shouldn't fire since we disabled menu key interception
      if (isOnHomeRoot) {
        console.log("[useTVBackHandler] On home root, allowing exit");
        return;
      }

      console.log("[useTVBackHandler] Menu pressed:", {
        currentTab,
        atTabRoot,
      });

      // If at tab root level (but not home)
      if (atTabRoot) {
        console.log("[useTVBackHandler] At tab root, navigating to home");
        router.navigate("/(auth)/(tabs)/(home)");
        return;
      }

      // Not at tab root - go back in the stack
      if (navigation.canGoBack()) {
        console.log("[useTVBackHandler] Going back in navigation stack");
        navigation.goBack();
        return;
      }

      // Fallback: navigate to home
      console.log("[useTVBackHandler] Fallback: navigating to home");
      router.navigate("/(auth)/(tabs)/(home)");
    }
  });

  // Android TV BackHandler
  useEffect(() => {
    if (!Platform.isTV) return;

    const handleBackPress = () => {
      // If on home root, allow app to exit
      if (isOnHomeRoot) {
        return false; // Don't prevent default (allows exit)
      }

      if (atTabRoot) {
        router.navigate("/(auth)/(tabs)/(home)");
        return true;
      }

      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }

      router.navigate("/(auth)/(tabs)/(home)");
      return true;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress,
    );

    return () => subscription.remove();
  }, [navigation, isOnHomeRoot, atTabRoot]);
}

/**
 * Call this at app startup to enable TV menu key interception.
 */
export function enableTVMenuKeyInterception() {
  if (Platform.isTV && TVEventControl) {
    console.log(
      "[enableTVMenuKeyInterception] Enabling TV menu key interception",
    );
    TVEventControl.enableTVMenuKey();
  }
}
