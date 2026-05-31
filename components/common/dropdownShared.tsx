// Shared internals for PlatformDropdown and PlayerSettingsPopover.
// Both components host SwiftUI content (Menu / Popover) inside @expo/ui's
// <Host>, both render an Android bottom-sheet card for the same three core
// option types (radio / toggle / action), and both wear the same wrapper
// boilerplate. This module is the single source of truth for those pieces.
//
// What lives here:
//   - useTriggerSize()  — measures the RN trigger's intrinsic size
//   - MeasuredTriggerHost — pins <Host> to that measured size (workaround
//     for @expo/ui SDK 55 sizing behaviour; see notes below)
//   - ToggleSwitch — the small purple switch used in the Android sheet
//   - OptionGroupCard — the rounded dark card with optional title that
//     wraps a group's option rows on Android
//
// What deliberately doesn't live here:
//   - The iOS rendering — PlatformDropdown uses a Menu, PlayerSettingsPopover
//     uses a hand-styled Popover. Nothing meaningful to share.
//   - The Android per-row renderers — PlatformDropdown handles 3 option types,
//     PlayerSettingsPopover handles 6 (adds slider/stepper/subgroup). Forcing
//     a shared abstraction would couple them. Each owns its own OptionItem.

import React, { useCallback, useState } from "react";
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";

// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import evaluates requireNativeModule('ExpoUI') at module
// load and crashes the entire route tree on tvOS. Load it lazily and only
// off-TV; both consumers also gate rendering on Platform.OS === "ios".
const { Host } = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");

type TriggerSize = { width: number; height: number };

/**
 * Measures and remembers the intrinsic size of a RN trigger view so the
 * surrounding <Host> can be pinned to a concrete box.
 *
 * Returns `[size, handleLayout]` — pass `handleLayout` to a hidden,
 * absolutely-positioned mirror of the trigger and use `size` as the
 * wrapper's `style` once measured.
 */
export function useTriggerSize(): [
  TriggerSize | null,
  (e: LayoutChangeEvent) => void,
] {
  const [size, setSize] = useState<TriggerSize | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);
  return [size, onLayout];
}

interface MeasuredTriggerHostProps {
  trigger: React.ReactNode;
  hostStyle?: any;
  children: React.ReactNode;
}

/**
 * Pins @expo/ui's <Host> to the trigger's measured size.
 *
 * @expo/ui's <Host> (SDK 55) fills its parent and reports its own size via
 * `setStyleSize`, so it can't size itself to content. If the wrapper has no
 * size, the Host's `flex: 1` height depends on the parent while the parent
 * depends on the Host — a circular dependency that collapses to 0 for any
 * dropdown nested more than one level deep (so only the first, shallowest
 * dropdown on screen stays visible).
 *
 * Giving the wrapper the measured trigger size breaks the cycle; the Host
 * then fills a concrete box.
 */
export const MeasuredTriggerHost: React.FC<MeasuredTriggerHostProps> = ({
  trigger,
  hostStyle,
  children,
}) => {
  const [size, handleMeasure] = useTriggerSize();
  return (
    <View style={size ?? { opacity: 0 }}>
      {/* Hidden measurer: lays the trigger out off-flow to capture its
          intrinsic size. Absolutely positioned WITHOUT right/bottom so it
          sizes to the trigger's content rather than to its parent. */}
      <View
        style={{ position: "absolute", top: 0, left: 0, opacity: 0 }}
        pointerEvents='none'
        aria-hidden
        onLayout={handleMeasure}
      >
        {trigger}
      </View>
      <Host style={[StyleSheet.absoluteFill, hostStyle as any]}>
        {children}
      </Host>
    </View>
  );
};

/** Small pill switch used by Android sheet rows. */
export const ToggleSwitch: React.FC<{ value: boolean }> = ({ value }) => (
  <View
    className={`w-12 h-7 rounded-full ${value ? "bg-purple-600" : "bg-neutral-600"} flex-row items-center`}
  >
    <View
      className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${value ? "translate-x-6" : "translate-x-1"}`}
    />
  </View>
);

/**
 * Rounded dark card with an optional title above it. Wraps a group's option
 * rows in the Android bottom sheet.
 */
export const OptionGroupCard: React.FC<{
  title?: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <View className='mb-6'>
    {title && (
      <Text className='text-lg font-semibold mb-3 text-neutral-300'>
        {title}
      </Text>
    )}
    <View
      style={{ borderRadius: 12, overflow: "hidden" }}
      className='bg-neutral-800 rounded-xl overflow-hidden'
    >
      {children}
    </View>
  </View>
);
