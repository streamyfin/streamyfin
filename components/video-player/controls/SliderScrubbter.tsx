import { useTrickplay } from "@/hooks/useTrickplay";
import { formatTimeString, msToTicks, ticksToSeconds } from "@/utils/time";
import React, { useRef, useState } from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { Slider } from "react-native-awesome-slider";
import { SharedValue, useSharedValue } from "react-native-reanimated";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";

interface SliderScrubberProps {
  cacheProgress: SharedValue<number>;
  handleSliderStart: () => void;
  handleSliderComplete: (value: number) => void;
  progress: SharedValue<number>;
  min: SharedValue<number>;
  max: SharedValue<number>;
  currentTime: number;
  remainingTime: number;
  item: BaseItemDto;
}

const SliderScrubber: React.FC<SliderScrubberProps> = ({
  cacheProgress,
  handleSliderStart,
  handleSliderComplete,
  progress,
  min,
  max,
  currentTime,
  remainingTime,
  item,
}) => {
  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const { trickPlayUrl, calculateTrickplayUrl, trickplayInfo } =
    useTrickplay(item);

  const handleSliderChange = (value: number) => {
    const progressInTicks = msToTicks(value);
    calculateTrickplayUrl(progressInTicks);

    const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
    const hours = Math.floor(progressInSeconds / 3600);
    const minutes = Math.floor((progressInSeconds % 3600) / 60);
    const seconds = progressInSeconds % 60;
    setTime({ hours, minutes, seconds });
  };

  return (
    <View className={`flex flex-col w-full shrink`}>
      <Slider
        theme={{
          maximumTrackTintColor: "rgba(255,255,255,0.2)",
          minimumTrackTintColor: "#fff",
          cacheTrackTintColor: "rgba(255,255,255,0.3)",
          bubbleBackgroundColor: "#fff",
          bubbleTextColor: "#000",
          heartbeatColor: "#999",
        }}
        cache={cacheProgress}
        onSlidingStart={handleSliderStart}
        onSlidingComplete={handleSliderComplete}
        onValueChange={handleSliderChange}
        containerStyle={{
          borderRadius: 100,
        }}
        renderBubble={() => {
          if (!trickPlayUrl || !trickplayInfo) {
            return null;
          }
          const { x, y, url } = trickPlayUrl;

          const tileWidth = 150;
          const tileHeight = 150 / trickplayInfo.aspectRatio!;
          return (
            <View
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: tileWidth,
                height: tileHeight,
                marginLeft: -tileWidth / 4,
                marginTop: -tileHeight / 4 - 60,
                zIndex: 10,
              }}
              className=" bg-neutral-800 overflow-hidden"
            >
              <Image
                cachePolicy={"memory-disk"}
                style={{
                  width: 150 * trickplayInfo?.data.TileWidth!,
                  height:
                    (150 / trickplayInfo.aspectRatio!) *
                    trickplayInfo?.data.TileHeight!,
                  transform: [
                    { translateX: -x * tileWidth },
                    { translateY: -y * tileHeight },
                  ],
                }}
                source={{ uri: url }}
                contentFit="cover"
              />
              <Text
                style={{
                  position: "absolute",
                  bottom: 5,
                  left: 5,
                  color: "white",
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  padding: 5,
                  borderRadius: 5,
                }}
              >
                {`${time.hours > 0 ? `${time.hours}:` : ""}${
                  time.minutes < 10 ? `0${time.minutes}` : time.minutes
                }:${time.seconds < 10 ? `0${time.seconds}` : time.seconds}`}
              </Text>
            </View>
          );
        }}
        sliderHeight={10}
        thumbWidth={0}
        progress={progress}
        minimumValue={min}
        maximumValue={max}
      />
      <View className="flex flex-row items-center justify-between mt-0.5">
        <Text className="text-[12px] text-neutral-400">
          {formatTimeString(currentTime, "ms")}
        </Text>
        <Text className="text-[12px] text-neutral-400">
          -{formatTimeString(remainingTime, "ms")}
        </Text>
      </View>
    </View>
  );
};

export default SliderScrubber;
