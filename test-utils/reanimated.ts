import { useRef } from "react";

/**
 * Stands for `react-native-reanimated` in a spec that renders a component
 * holding shared values and asserting on what it does with them, not on an
 * animation.
 *
 * Reanimated ships its own Jest mock, but its `useSharedValue` hands out a
 * new object on every render. A component that lists a shared value in an
 * effect's dependencies then re-runs that effect on each render, and one that
 * sets state from it never settles. Here a component keeps one value for its
 * lifetime, read and written on the JS thread like the real one.
 *
 * Only what the specs so far needed is here: add an export when a component
 * under test imports another one, rather than reaching for the real module,
 * which needs the native worklets runtime.
 */
export const reanimatedModule = {
  useAnimatedReaction: () => {},
  useSharedValue: <Value>(initial: Value) =>
    useRef({
      value: initial,
      get() {
        return this.value;
      },
      set(next: Value) {
        this.value = next;
      },
    }).current,
};
