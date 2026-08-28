import { AppState, type NativeEventSubscription } from "react-native";

/**
 * Runs something every time the app comes back to the foreground.
 *
 * The callback is resolved when the app wakes rather than when the listener is
 * registered. That distinction is the whole point: a listener registered once,
 * from an effect with no dependencies, otherwise keeps calling the closure of
 * the first render for the life of the process. Switch account without
 * restarting and the work runs against whatever that first render captured,
 * which for the plugin settings refresh meant the previous server and the
 * previous token.
 *
 * @param latest Called on each wake to obtain the callback to run, so the
 *   caller can hand over a ref and let it point wherever it currently points.
 * @returns The unsubscribe function, for an effect cleanup.
 */
export const onAppForeground = (
  latest: () => (() => void) | undefined,
): (() => void) => {
  const subscription: NativeEventSubscription = AppState.addEventListener(
    "change",
    (state) => {
      if (state === "active") latest()?.();
    },
  );

  return () => subscription.remove();
};
