/**
 * Chapter tick marks drawn as an absolute overlay over a progress slider.
 * Renders nothing for media with one or zero chapters. `pointerEvents: "none"`
 * so the slider underneath still receives touches.
 */

import { useState } from "react";
import { type LayoutChangeEvent, PixelRatio, View } from "react-native";
import type { ChapterMarker } from "@/utils/chapters";

interface ChapterTicksProps {
  /** Pre-computed markers (caller memoizes — avoids double-computing here). */
  markers: ChapterMarker[];
  /** Tick colour. */
  color?: string;
  /** Tick height in px — slightly less than the slider track thickness. */
  height?: number;
  /** Tick width in px — integer to avoid sub-pixel anti-aliasing. */
  width?: number;
}

export function ChapterTicks({
  markers,
  // Semi-transparent black contrasts against both the filled progress
  // (#fff) and the unfilled track (rgba(255,255,255,0.2)) so the ticks
  // stay visible across the whole bar as playback advances.
  color = "rgba(0,0,0,0.55)",
  height = 14,
  width = 2,
}: ChapterTicksProps) {
  // Hooks must run unconditionally — keep them before any early return.
  const [sliderWidth, setSliderWidth] = useState(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    setSliderWidth(e.nativeEvent.layout.width);
  };

  // One chapter (typically a single marker at 0) is not worth marking.
  if (markers.length <= 1) return null;

  return (
    <View
      pointerEvents='none'
      onLayout={handleLayout}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        // Let ticks taller than this container bleed beyond its bounds.
        overflow: "visible",
      }}
    >
      {sliderWidth > 0 &&
        markers
          // Skip the leading 0ms marker — it overlaps the slider start and
          // adds visual noise at an already-rendered boundary.
          .filter((marker) => marker.positionMs > 0)
          .map((marker, index) => {
            // Align both the position AND the width onto the device's
            // physical pixel grid. Without this, fractional dp values land
            // at different sub-pixel fractions per tick — Android samples
            // each one differently and some ticks render visibly thicker.
            const centerDp = (marker.percent / 100) * sliderWidth;
            const left = PixelRatio.roundToNearestPixel(centerDp - width / 2);
            const snappedWidth = PixelRatio.roundToNearestPixel(width);
            return (
              <View
                key={`${marker.positionMs}-${index}`}
                style={{
                  position: "absolute",
                  left,
                  top: "50%",
                  marginTop: -height / 2,
                  height,
                  width: snappedWidth,
                  backgroundColor: color,
                }}
              />
            );
          })}
    </View>
  );
}
