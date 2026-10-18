import { useEffect, useRef } from "react";

/** Writes made from JS that the UI thread has not taken yet. */
const heldWrites: (() => void)[] = [];
let holding = false;

/**
 * Stands for a UI thread that has not got to the writes made from JS.
 *
 * The real library applies a write made from JS on the UI thread, some time
 * after it was made, and answers a read from JS with what the UI thread
 * holds. When handlers run back to back on the JS thread, what one wrote is
 * not there yet for the next one to read. From this call until
 * `releaseSharedValueWrites()`, a shared value keeps answering with what it
 * held before.
 */
export const holdSharedValueWrites = () => {
  holding = true;
};

/** The UI thread catches up: the writes held so far land, in order. */
export const releaseSharedValueWrites = () => {
  holding = false;
  for (const write of heldWrites.splice(0)) write();
};

const reactions = new Set<() => void>();
let runningReactions = false;

const triggerReanimatedReactions = () => {
  if (runningReactions) return;
  runningReactions = true;
  try {
    for (const r of [...reactions]) r();
  } finally {
    runningReactions = false;
  }
};

export const makeSharedValue = <Value>(initial: Value) => sharedValue(initial);

const sharedValue = <Value>(initial: Value) => {
  let held = initial;
  const write = (next: Value) => {
    if (Object.is(held, next)) return;
    if (holding) {
      heldWrites.push(() => {
        held = next;
        triggerReanimatedReactions();
      });
    } else {
      held = next;
      triggerReanimatedReactions();
    }
  };
  return {
    get value() {
      return held;
    },
    set value(next: Value) {
      write(next);
    },
    get: () => held,
    set: write,
  };
};

/**
 * Stands for `react-native-reanimated` in a spec that renders a component
 * holding shared values and asserting on what it does with them, not on an
 * animation.
 *
 * Reanimated ships its own Jest mock, but its `useSharedValue` hands out a
 * new object on every render. A component that lists a shared value in an
 * effect's dependencies then re-runs that effect on each render, and one that
 * sets state from it never settles. Here a component keeps one value for its
 * lifetime. A write lands at once, unless the spec holds the writes back
 * (`holdSharedValueWrites`).
 *
 * Only what the specs so far needed is here: add an export when a component
 * under test imports another one, rather than reaching for the real module,
 * which needs the native worklets runtime.
 */
const { View, Text, ScrollView } = require("react-native");

const Animated = {
  View,
  Text,
  ScrollView,
  createAnimatedComponent: (comp: any) => comp,
};

export const reanimatedModule = {
  default: Animated,
  ...Animated,
  // A worklet asking for a function to run on the JS thread: here it is
  // already there.
  runOnJS:
    <Args extends unknown[]>(fn: (...args: Args) => void) =>
    (...args: Args) =>
      fn(...args),
  useAnimatedReaction: (
    prepare: () => any,
    react: (current: any, previous: any) => void,
    deps: any[] = [],
  ) => {
    const prevRef = useRef<any>(undefined);
    const prepareRef = useRef(prepare);
    prepareRef.current = prepare;
    const reactRef = useRef(react);
    reactRef.current = react;

    useEffect(() => {
      const runner = () => {
        const current = prepareRef.current();
        reactRef.current(current, prevRef.current);
        prevRef.current = current;
      };
      reactions.add(runner);
      runner();
      return () => {
        reactions.delete(runner);
      };
    }, deps);
  },
  useSharedValue: <Value>(initial: Value) =>
    useRef(sharedValue(initial)).current,
  useAnimatedStyle: (updater: () => any) => {
    try {
      return updater() ?? {};
    } catch {
      return {};
    }
  },
  withTiming: (toValue: unknown) => toValue,
  withDelay: (_delay: unknown, animation: unknown) => animation,
  withRepeat: (animation: unknown) => animation,
  cancelAnimation: () => {},
  interpolate: () => 0,
  Easing: {
    out: () => ({}),
    cubic: {},
    inOut: () => ({}),
    ease: {},
  },
  Extrapolation: { CLAMP: "clamp" },
};
