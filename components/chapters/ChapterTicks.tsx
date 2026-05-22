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
}

export function ChapterTicks({
  chapters,
  durationMs,
  color = "#fff",
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
            top: "25%",
            height: "50%",
            width: 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}
