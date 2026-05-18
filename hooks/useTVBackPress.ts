import { type DependencyList, useEffect } from "react";
import { BackHandler, Platform } from "react-native";

type TVBackPressHandler = () => boolean | null | undefined;

let TVEventControl: {
  enableTVMenuKey: () => void;
  disableTVMenuKey: () => void;
} | null = null;

if (Platform.isTV) {
  try {
    TVEventControl = require("react-native").TVEventControl;
  } catch {
    TVEventControl = null;
  }
}

export function enableTVMenuKeyInterception() {
  if (Platform.isTV && TVEventControl) {
    TVEventControl.enableTVMenuKey();
  }
}

export function disableTVMenuKeyInterception() {
  if (Platform.isTV && TVEventControl) {
    TVEventControl.disableTVMenuKey();
  }
}

/**
 * Subscribe to TV back presses through React Native's BackHandler.
 *
 * On Android TV this handles the hardware back button. On tvOS,
 * react-native-tvos maps the Apple TV menu button to the same API when menu key
 * interception is enabled.
 *
 * @see https://reactnative.dev/docs/backhandler
 */
export function useTVBackPress(
  handler: TVBackPressHandler,
  deps: DependencyList,
) {
  useEffect(() => {
    if (!Platform.isTV) return;

    // BackHandler is the shared back/menu surface for TV platforms:
    // Android TV sends hardware back here, and react-native-tvos sends menu
    // here when menu key interception is enabled.
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handler,
    );

    return () => subscription.remove();
  }, deps);
}
