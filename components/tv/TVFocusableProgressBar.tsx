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
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

const ReanimatedView = ReanimatedModule.View;

export interface TVFocusableProgressBarProps {
  /** Progress value (SharedValue) in milliseconds */
  progress: SharedValue<number>;
  /** Maximum value in milliseconds */
  max: SharedValue<number>;
  /** Cache progress value (SharedValue) in milliseconds */
  cacheProgress?: SharedValue<number>;
  /** Chapter positions as percentages (0-100) for tick marks */
  chapterPositions?: number[];
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

const PROGRESS_BAR_HEIGHT = scaleSize(14);

export const TVFocusableProgressBar: React.FC<TVFocusableProgressBarProps> =
  React.memo(
    ({
      progress,
      max,
      cacheProgress,
      chapterPositions = [],
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
            <View style={styles.progressTrackWrapper}>
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
              {/* Chapter markers - positioned outside track to extend above */}
              {chapterPositions.length > 0 && (
                <View
                  style={styles.chapterMarkersContainer}
                  pointerEvents='none'
                >
                  {chapterPositions.map((position, index) => (
                    <View
                      key={`chapter-marker-${index}`}
                      style={[styles.chapterMarker, { left: `${position}%` }]}
                    />
                  ))}
                </View>
              )}
            </View>
          </Animated.View>
        </Pressable>
      );
    },
  );

const styles = StyleSheet.create({
  pressableContainer: {
    // Add padding for focus scale animation to not clip
    paddingVertical: scaleSize(8),
    paddingHorizontal: scaleSize(4),
  },
  animatedContainer: {
    height: PROGRESS_BAR_HEIGHT + scaleSize(8),
    justifyContent: "center",
    borderRadius: scaleSize(12),
    paddingHorizontal: scaleSize(4),
  },
  animatedContainerFocused: {
    // Subtle glow effect when focused
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: scaleSize(12),
  },
  progressTrackWrapper: {
    position: "relative",
    height: PROGRESS_BAR_HEIGHT,
  },
  progressTrack: {
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: scaleSize(8),
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
    borderRadius: scaleSize(8),
  },
  progressFill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: scaleSize(8),
  },
  chapterMarkersContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  chapterMarker: {
    position: "absolute",
    width: scaleSize(2),
    height: PROGRESS_BAR_HEIGHT + scaleSize(5),
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: scaleSize(1),
    transform: [{ translateX: -scaleSize(1) }],
  },
});
