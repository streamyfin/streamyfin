/**
 * Chapter tick marks drawn as an absolute overlay over a progress slider.
 * Renders nothing for media with one or zero chapters. `pointerEvents: "none"`
 * so the slider underneath still receives touches.
 */

import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { View } from "react-native";
import { chapterMarkers } from "@/utils/chapters";

interface ChapterTicksProps {
  chapters: ChapterInfo[] | null | undefined;
  /** Total media duration in milliseconds. */
  durationMs: number;
  /** Tick colour. */
  color?: string;
  /** Tick height in px — slightly less than the slider track thickness. */
  height?: number;
}

export function ChapterTicks({
  chapters,
  durationMs,
  color = "#fff",
  height = 6,
}: ChapterTicksProps) {
  const markers = chapterMarkers(chapters, durationMs);
  // One chapter (typically a single marker at 0) is not worth marking.
  if (markers.length <= 1) return null;

  return (
    <View
      pointerEvents='none'
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
    >
      {markers.map((marker, index) => (
        <View
          key={`${marker.positionMs}-${index}`}
          style={{
            position: "absolute",
            left: `${marker.percent}%`,
            top: "50%",
            marginTop: -height / 2,
            height,
            width: 1.5,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
