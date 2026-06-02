import React from "react";
import { View } from "react-native";
import { scaleSize } from "@/utils/scaleSize";

export interface TVProgressBarProps {
  /** Progress value between 0 and 1 */
  progress: number;
  /** Background color of the track */
  trackColor?: string;
  /** Color of the progress fill */
  fillColor?: string;
  /** Maximum width of the progress bar */
  maxWidth?: number;
  /** Height of the progress bar */
  height?: number;
}

export const TVProgressBar: React.FC<TVProgressBarProps> = React.memo(
  ({
    progress,
    trackColor = "rgba(255,255,255,0.2)",
    fillColor = "#ffffff",
    maxWidth = 400,
    height = 4,
  }) => {
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const scaledMaxWidth = scaleSize(maxWidth);
    const scaledHeight = scaleSize(height);

    return (
      <View style={{ maxWidth: scaledMaxWidth, marginBottom: scaleSize(24) }}>
        <View
          style={{
            height: scaledHeight,
            backgroundColor: trackColor,
            borderRadius: scaledHeight / 2,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${clampedProgress * 100}%`,
              height: "100%",
              backgroundColor: fillColor,
              borderRadius: scaledHeight / 2,
            }}
          />
        </View>
      </View>
    );
  },
);
