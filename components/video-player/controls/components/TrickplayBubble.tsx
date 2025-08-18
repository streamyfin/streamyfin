import { Image } from "expo-image";
import React from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  calculateTrickplayDimensions,
  formatTimeForBubble,
} from "../utils/trickplayUtils";

interface TrickplayBubbleProps {
  trickPlayUrl?: {
    x: number;
    y: number;
    url: string;
  };
  trickplayInfo?: {
    aspectRatio: number;
    data: {
      TileWidth?: number;
      TileHeight?: number;
    };
  };
  time: {
    hours: number;
    minutes: number;
    seconds: number;
  };
}

export const TrickplayBubble: React.FC<TrickplayBubbleProps> = ({
  trickPlayUrl,
  trickplayInfo,
  time,
}) => {
  if (!trickPlayUrl || !trickplayInfo) {
    return null;
  }

  const { x, y, url } = trickPlayUrl;
  const { tileWidth, tileHeight, scaledWidth } = calculateTrickplayDimensions(
    trickplayInfo.aspectRatio,
  );

  return (
    <View
      style={{
        position: "absolute",
        left: -62,
        bottom: 0,
        paddingTop: 30,
        paddingBottom: 5,
        width: scaledWidth,
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
            width: 150 * (trickplayInfo.data.TileWidth || 1),
            height:
              (150 / trickplayInfo.aspectRatio) *
              (trickplayInfo.data.TileHeight || 1),
            transform: [
              { translateX: -x * tileWidth },
              { translateY: -y * tileHeight },
            ],
            resizeMode: "cover",
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
        {formatTimeForBubble(time)}
      </Text>
    </View>
  );
};
