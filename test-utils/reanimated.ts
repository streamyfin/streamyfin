import {
  type ComponentType,
  createElement,
  forwardRef,
  useEffect,
  useReducer,
  useRef,
} from "react";
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

const sameProps = (a: object, b: object) => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) =>
      Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    )
  );
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
  // The real one applies `animatedProps` on the UI thread; here they land as
  // plain props, so a spec sees what the component draws.
  createAnimatedComponent: (component: ComponentType<object>) =>
    forwardRef<unknown, { animatedProps?: object }>(
      ({ animatedProps, ...props }, ref) =>
        createElement(component as ComponentType<{ ref: unknown }>, {
          ...props,
          ...animatedProps,
          ref,
        }),
    ),
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
  // The real one updates the props on the UI thread whenever a shared value
  // they read changes; here such a change renders the component again.
  useAnimatedProps: (updater: () => object) => {
    const [, renderAgain] = useReducer((count: number) => count + 1, 0);
    const updaterRef = useRef(updater);
    updaterRef.current = updater;
    const props = updater();
    const shownRef = useRef(props);
    shownRef.current = props;
    useEffect(() => {
      const reaction = () => {
        if (!sameProps(updaterRef.current(), shownRef.current)) renderAgain();
      };
      reactions.add(reaction);
      // An effect that ran before this one may already have written.
      reaction();
      return () => {
        reactions.delete(reaction);
      };
    }, []);
    return props;
  },
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
