import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

export interface ChapterMarkersProps {
  /** Array of chapter positions as percentages (0-100) */
  chapterPositions: number[];
  /** Optional style overrides for the container */
  style?: ViewStyle;
  /** Height of the marker lines (should be > track height to extend above) */
  markerHeight?: number;
  /** Color of the marker lines */
  markerColor?: string;
}

/**
 * Renders vertical tick marks on the progress bar at chapter positions
 * Should be overlaid on the slider track
 */
export const ChapterMarkers: React.FC<ChapterMarkersProps> = React.memo(
  ({
    chapterPositions,
    style,
    markerHeight = 15,
    markerColor = "rgba(255, 255, 255, 0.6)",
  }) => {
    if (!chapterPositions.length) {
      return null;
    }

    return (
      <View style={[styles.container, style]} pointerEvents='none'>
        {chapterPositions.map((position, index) => (
          <View
            key={`chapter-marker-${index}`}
            style={[
              styles.marker,
              {
                left: `${position}%`,
                height: markerHeight,
                bottom: 0,
                backgroundColor: markerColor,
              },
            ]}
          />
        ))}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  marker: {
    position: "absolute",
    width: 2,
    borderRadius: 1,
    transform: [{ translateX: -1 }], // Center the marker on its position
  },
});
