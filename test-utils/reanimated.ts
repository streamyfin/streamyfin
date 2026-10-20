import { type ComponentType, useEffect, useRef } from "react";
import { ScrollView, Text, View } from "react-native";

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

export const makeSharedValue = <Value>(initial: Value) => {
  let held = initial;
  const land = (next: Value) => {
    const changed = !Object.is(held, next);
    held = next;
    if (changed) triggerReanimatedReactions();
  };
  const write = (next: Value) => {
    if (holding) heldWrites.push(() => land(next));
    else land(next);
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

const Animated = {
  View,
  Text,
  ScrollView,
  createAnimatedComponent: (component: ComponentType) => component,
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
    prepare: () => unknown,
    react: (current: unknown, previous: unknown) => void,
    deps: unknown[] = [],
  ) => {
    const prevRef = useRef<unknown>(undefined);
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
    useRef(makeSharedValue(initial)).current,
  useAnimatedStyle: (updater: () => object) => updater(),
  withTiming: (toValue: unknown) => toValue,
  withDelay: (_delay: unknown, animation: unknown) => animation,
  withRepeat: (animation: unknown) => animation,
  cancelAnimation: () => {},
  interpolate: (
    value: number,
    [inputStart, inputEnd]: number[],
    [outputStart, outputEnd]: number[],
  ) => {
    const ratio = (value - inputStart) / (inputEnd - inputStart);
    return (
      outputStart + Math.min(Math.max(ratio, 0), 1) * (outputEnd - outputStart)
    );
  },
  Easing: {
    out: () => ({}),
    cubic: {},
    inOut: () => ({}),
    ease: {},
  },
  Extrapolation: { CLAMP: "clamp" },
};
