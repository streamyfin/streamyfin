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
}

export const TrickplayBubble: FC<TrickplayBubbleProps> = ({
  trickPlayUrl,
  trickplayInfo,
  time,
}) => {
  if (!trickPlayUrl || !trickplayInfo) {
    return null;
  }

  const { x, y, url } = trickPlayUrl;
  const tileWidth = CONTROLS_CONSTANTS.TILE_WIDTH;
  const tileHeight = tileWidth / trickplayInfo.aspectRatio!;

  return (
    <View
      style={{
        position: "absolute",
        left: -62,
        bottom: 0,
        paddingTop: 30,
        paddingBottom: 5,
        width: tileWidth * 1.5,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: tileWidth,
          height: tileHeight,
          alignSelf: "center",
          transform: [{ scale: 1.4 }],
          borderRadius: 5,
        }}
        className='bg-neutral-800 overflow-hidden'
      >
        <Image
          cachePolicy={"memory-disk"}
          style={{
            width: tileWidth * trickplayInfo?.data.TileWidth!,
            height:
              (tileWidth / trickplayInfo.aspectRatio!) *
              trickplayInfo?.data.TileHeight!,
            transform: [
              { translateX: -x * tileWidth },
              { translateY: -y * tileHeight },
            ],
          }}
          source={{ uri: url }}
          contentFit='cover'
        />
      </View>
      <Text
        style={{
          marginTop: 30,
          fontSize: 16,
        }}
      >
        {`${time.hours > 0 ? `${time.hours}:` : ""}${
          time.minutes < 10 ? `0${time.minutes}` : time.minutes
        }:${time.seconds < 10 ? `0${time.seconds}` : time.seconds}`}
      </Text>
    </View>
  );
};
