/**
 * Shared scrub-preview bubble for the casting progress bars.
 *
 * The slider (`react-native-awesome-slider`) sizes, centres and clamps this
 * bubble on the thumb via its `bubbleMaxWidth` / `bubbleWidth` props. This
 * component therefore does NO horizontal positioning — it only anchors itself
 * vertically (`bottom: 0`, growing upward) so it sits above the progress bar.
 */

import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import type { useTrickplay } from "@/hooks/useTrickplay";
import { formatTrickplayTime } from "@/utils/casting/helpers";

type TrickplayReturn = ReturnType<typeof useTrickplay>;

interface CastTrickplayBubbleProps {
  /** Current trickplay image URL/coordinates, or null. */
  trickPlayUrl: TrickplayReturn["trickPlayUrl"];
  /** Parsed trickplay metadata, or null. */
  trickplayInfo: TrickplayReturn["trickplayInfo"];
  /** Scrub time to display. */
  trickplayTime: { hours: number; minutes: number; seconds: number };
  /** Trickplay tile width in px (220 main player, 140 mini-player). */
  tileWidth: number;
}

export function CastTrickplayBubble({
  trickPlayUrl,
  trickplayInfo,
  trickplayTime,
  tileWidth,
}: CastTrickplayBubbleProps) {
  const timeText = (
    <Text
      style={{
        color: "#fff",
        fontSize: 13,
        fontWeight: "600",
        textAlign: "center",
        textShadowColor: "rgba(0, 0, 0, 0.85)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      }}
    >
      {formatTrickplayTime(trickplayTime)}
    </Text>
  );

  // Anchored to the bottom of the slider-positioned container, growing upward,
  // and filling the container width (left/right: 0) so it stays centred on the
  // thumb. No horizontal maths here — the slider owns horizontal placement.
  if (!trickPlayUrl || !trickplayInfo) {
    return (
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        {timeText}
      </View>
    );
  }

  const { x, y, url } = trickPlayUrl;
  const tileHeight = tileWidth / (trickplayInfo.aspectRatio ?? 1.78);

  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: "center",
        gap: 4,
      }}
    >
      {timeText}
      <View
        style={{
          width: tileWidth,
          height: tileHeight,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
        }}
      >
        <Image
          cachePolicy='memory-disk'
          style={{
            width: tileWidth * (trickplayInfo.data?.TileWidth ?? 1),
            height: tileHeight * (trickplayInfo.data?.TileHeight ?? 1),
            transform: [
              { translateX: -x * tileWidth },
              { translateY: -y * tileHeight },
            ],
          }}
          source={{ uri: url }}
          contentFit='cover'
        />
      </View>
    </View>
  );
}
