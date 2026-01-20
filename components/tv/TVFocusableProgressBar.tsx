import React from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";
import ReanimatedModule, { useAnimatedStyle } from "react-native-reanimated";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

const ReanimatedView = ReanimatedModule.View;

export interface TVFocusableProgressBarProps {
  /** Progress value (SharedValue) in milliseconds */
  progress: SharedValue<number>;
  /** Maximum value in milliseconds */
  max: SharedValue<number>;
  /** Cache progress value (SharedValue) in milliseconds */
  cacheProgress?: SharedValue<number>;
  /** Callback when the progress bar receives focus */
  onFocus?: () => void;
  /** Callback when the progress bar loses focus */
  onBlur?: () => void;
  /** Callback ref setter for focus guide destination pattern */
  refSetter?: (ref: View | null) => void;
  /** Whether this component is disabled */
  disabled?: boolean;
  /** Whether this component should receive initial focus */
  hasTVPreferredFocus?: boolean;
  /** Optional style overrides */
  style?: ViewStyle;
}

const PROGRESS_BAR_HEIGHT = 16;

export const TVFocusableProgressBar: React.FC<TVFocusableProgressBarProps> =
  React.memo(
    ({
      progress,
      max,
      cacheProgress,
      onFocus,
      onBlur,
      refSetter,
      disabled = false,
      hasTVPreferredFocus = false,
      style,
    }) => {
      const { focused, handleFocus, handleBlur, animatedStyle } =
        useTVFocusAnimation({
          scaleAmount: 1.02,
          duration: 120,
          onFocus,
          onBlur,
        });

      const progressFillStyle = useAnimatedStyle(() => ({
        width: `${max.value > 0 ? (progress.value / max.value) * 100 : 0}%`,
      }));

      const cacheProgressStyle = useAnimatedStyle(() => ({
        width: `${max.value > 0 && cacheProgress ? (cacheProgress.value / max.value) * 100 : 0}%`,
      }));

      return (
        <Pressable
          ref={refSetter}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          focusable={!disabled}
          hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
          style={[styles.pressableContainer, style]}
        >
          <Animated.View
            style={[
              styles.animatedContainer,
              animatedStyle,
              focused && styles.animatedContainerFocused,
            ]}
          >
            <View
              style={[
                styles.progressTrack,
                focused && styles.progressTrackFocused,
              ]}
            >
              {cacheProgress && (
                <ReanimatedView
                  style={[styles.cacheProgress, cacheProgressStyle]}
                />
              )}
              <ReanimatedView
                style={[styles.progressFill, progressFillStyle]}
              />
            </View>
          </Animated.View>
        </Pressable>
      );
    },
  );

const styles = StyleSheet.create({
  pressableContainer: {
    // Add padding for focus scale animation to not clip
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  animatedContainer: {
    height: PROGRESS_BAR_HEIGHT + 8,
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  animatedContainerFocused: {
    // Subtle glow effect when focused
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  progressTrack: {
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    overflow: "hidden",
  },
  progressTrackFocused: {
    // Brighter track when focused
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  cacheProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 8,
  },
  progressFill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 8,
  },
});
