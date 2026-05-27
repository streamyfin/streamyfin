import { Image } from "expo-image";
import type { FC } from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { CONTROLS_CONSTANTS } from "./constants";

const BASE_IMAGE_SCALE = 1.4;
const BUBBLE_LEFT_OFFSET = 62;
const BUBBLE_WIDTH_MULTIPLIER = 1.5;

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
  /** Scale factor for the image (default 1). Does not affect timestamp text. */
  imageScale?: number;
}

function formatTime(hours: number, minutes: number, seconds: number): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const prefix = hours > 0 ? `${hours}:` : "";
  return `${prefix}${pad(minutes)}:${pad(seconds)}`;
}

export const TrickplayBubble: FC<TrickplayBubbleProps> = ({
  trickPlayUrl,
  trickplayInfo,
  time,
  imageScale = 1,
}) => {
  if (!trickPlayUrl || !trickplayInfo) {
    return null;
  }

  const { x, y, url } = trickPlayUrl;
  const tileWidth = CONTROLS_CONSTANTS.TILE_WIDTH;
  const tileHeight = tileWidth / trickplayInfo.aspectRatio!;
  const finalScale = BASE_IMAGE_SCALE * imageScale;

  return (
    <View
      style={{
        position: "absolute",
        left: -BUBBLE_LEFT_OFFSET * imageScale,
        bottom: 0,
        paddingTop: 30,
        paddingBottom: 5,
        width: tileWidth * BUBBLE_WIDTH_MULTIPLIER * imageScale,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: tileWidth,
          height: tileHeight,
          alignSelf: "center",
          transform: [{ scale: finalScale }],
          borderRadius: 5,
        }}
        className='bg-neutral-800 overflow-hidden'
      >
        <Image
          cachePolicy='memory-disk'
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
      </View>
      <Text style={{ marginTop: 30, fontSize: 16 }}>
        {formatTime(time.hours, time.minutes, time.seconds)}
      </Text>
    </View>
  );
};
