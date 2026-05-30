import { Image } from "expo-image";
import type { FC } from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { CONTROLS_CONSTANTS } from "./constants";

interface TrickplayBubbleProps {
  trickPlayUrl: {
    x: number;
    y: number;
    url: string;
  } | null;
  trickplayInfo: {
    aspectRatio?: number;
    data: {
      TileWidth?: number;
      TileHeight?: number;
    };
  } | null;
  time: {
    hours: number;
    minutes: number;
    seconds: number;
  };
  /** Chapter name at the scrubbed position, if any. */
  chapterName?: string | null;
}

export const TrickplayBubble: FC<TrickplayBubbleProps> = ({
  trickPlayUrl,
  trickplayInfo,
  time,
  chapterName,
}) => {
  if (!trickPlayUrl || !trickplayInfo) {
    return null;
  }

  const { x, y, url } = trickPlayUrl;
  const tileWidth = CONTROLS_CONSTANTS.TILE_WIDTH;
  const tileHeight = tileWidth / trickplayInfo.aspectRatio!;
  const timeStr = `${time.hours > 0 ? `${time.hours}:` : ""}${
    time.minutes < 10 ? `0${time.minutes}` : time.minutes
  }:${time.seconds < 10 ? `0${time.seconds}` : time.seconds}`;

  // Slightly larger preview than before (scale 1.6 vs old 1.4) to give the
  // overlay text more room and feel closer to the Jellyfin web style.
  const previewScale = 1.6;

  return (
    <View
      style={{
        position: "absolute",
        left: -62,
        // Sit just above the slider — high enough not to overlap the
        // progress bar, low enough to feel anchored to the thumb.
        bottom: 0,
        paddingTop: 12,
        paddingBottom: 5,
        width: tileWidth * 1.5,
        justifyContent: "center",
        alignItems: "center",
        // Bring the bubble in front of the player title / overlays.
        zIndex: 999,
        elevation: 10,
      }}
    >
      <View
        style={{
          width: tileWidth,
          height: tileHeight,
          alignSelf: "center",
          transform: [{ scale: previewScale }],
          borderRadius: 5,
        }}
        className='bg-neutral-800 overflow-hidden'
      >
        <Image
          cachePolicy={"memory-disk"}
          style={{
            width: tileWidth * (trickplayInfo.data.TileWidth ?? 1),
            height:
              (tileWidth / (trickplayInfo.aspectRatio ?? 1)) *
              (trickplayInfo.data.TileHeight ?? 1),
            transform: [
              { translateX: -x * tileWidth },
              { translateY: -y * tileHeight },
            ],
          }}
          source={{ uri: url }}
          contentFit='cover'
        />
        {/*
         * Bottom-right overlay (Jellyfin web style) — chapter name (small,
         * faded) above the timestamp (small, bold). Sits on top of the
         * trickplay frame inside the same overflow:hidden container so it
         * always stays within the bubble bounds.
         */}
        <View
          pointerEvents='none'
          style={{
            position: "absolute",
            left: 4,
            bottom: 3,
            alignItems: "flex-start",
            paddingHorizontal: 3,
            paddingVertical: 1,
            borderRadius: 3,
            backgroundColor: "rgba(0,0,0,0.55)",
            maxWidth: tileWidth - 8,
          }}
        >
          {chapterName ? (
            <Text
              numberOfLines={1}
              style={{
                color: "#fff",
                fontSize: 7,
                opacity: 0.85,
                lineHeight: 9,
              }}
            >
              {chapterName}
            </Text>
          ) : null}
          <Text
            style={{
              color: "#fff",
              fontSize: 8,
              fontWeight: "600",
              lineHeight: 10,
            }}
          >
            {timeStr}
          </Text>
        </View>
      </View>
    </View>
  );
};
