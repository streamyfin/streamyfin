import { AppState, type NativeEventSubscription } from "react-native";

/**
 * Runs something every time the app comes back to the foreground.
 *
 * The listener lives as long as the caller keeps it, often the whole process,
 * so `run` must read what it works on when it runs, not when it was made: a
 * callback that captured the api at the first render kept refreshing the
 * plugin settings against the previous server and token after an account
 * switch.
 *
 * @returns The unsubscribe function, for an effect cleanup.
 */
export const onAppForeground = (run: () => void): (() => void) => {
  const subscription: NativeEventSubscription = AppState.addEventListener(
    "change",
    (state) => {
      if (state === "active") run();
    },
  );

  return () => subscription.remove();
};
