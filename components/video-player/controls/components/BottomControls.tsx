import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import React from "react";
import { View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import Animated, { type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useSettings } from "@/utils/atoms/settings";
import { formatTimeString } from "@/utils/time";
import { SLIDER_CONFIG, SLIDER_THEME } from "../constants";
import NextEpisodeCountDownButton from "../NextEpisodeCountDownButton";
import SkipButton from "../SkipButton";
import { TrickplayBubble } from "./TrickplayBubble";

interface BottomControlsProps {
  item: BaseItemDto;
  showControls: boolean;
  isSliding: boolean;
  showRemoteBubble: boolean;
  currentTime: number;
  remainingTime: number;
  isVlc: boolean;
  nextItem?: BaseItemDto;
  showSkipButton: boolean;
  showSkipCreditButton: boolean;
  cacheProgress: SharedValue<number>;
  min: SharedValue<number>;
  max: SharedValue<number>;
  effectiveProgress: SharedValue<number>;
  animatedControlsStyle: any;
  animatedSliderStyle: any;
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
  getEndTime: () => string;
  onControlsInteraction: () => void;
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onSliderStart: () => void;
  onSliderComplete: (value: number) => void;
  onSliderChange: (value: number) => void;
  onSkipIntro: () => void;
  onSkipCredit: () => void;
  onNextEpisodeAutoPlay: () => void;
  onNextEpisodeManual: () => void;
}

export const BottomControls: React.FC<BottomControlsProps> = ({
  item,
  showControls,
  isSliding,
  showRemoteBubble,
  currentTime,
  remainingTime,
  isVlc,
  nextItem,
  showSkipButton,
  showSkipCreditButton,
  cacheProgress,
  min,
  max,
  effectiveProgress,
  animatedControlsStyle,
  animatedSliderStyle,
  trickPlayUrl,
  trickplayInfo,
  time,
  getEndTime,
  onControlsInteraction,
  onTouchStart,
  onTouchEnd,
  onSliderStart,
  onSliderComplete,
  onSliderChange,
  onSkipIntro,
  onSkipCredit,
  onNextEpisodeAutoPlay,
  onNextEpisodeManual,
}) => {
  const [settings] = useSettings();
  const insets = useSafeAreaInsets();

  const renderTrickplayBubble = () => (
    <TrickplayBubble
      trickPlayUrl={trickPlayUrl}
      trickplayInfo={trickplayInfo}
      time={time}
    />
  );

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
          left: settings?.safeAreaInControlsEnabled ? insets.left : 0,
          bottom: settings?.safeAreaInControlsEnabled
            ? Math.max(insets.bottom - 17, 0)
            : 0,
        },
        animatedControlsStyle,
      ]}
      className={"flex flex-col px-2"}
      onTouchStart={onControlsInteraction}
    >
      <View
        className='shrink flex flex-col justify-center h-full'
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "column",
            alignSelf: "flex-end", // Shrink height based on content
          }}
          pointerEvents={showControls ? "box-none" : "none"}
        >
          {item?.Type === "Episode" && (
            <Text className='opacity-50'>
              {`${item.SeriesName} - ${item.SeasonName} Episode ${item.IndexNumber}`}
            </Text>
          )}
          <Text className='font-bold text-xl'>{item?.Name}</Text>
          {item?.Type === "Movie" && (
            <Text className='text-xs opacity-50'>{item?.ProductionYear}</Text>
          )}
          {item?.Type === "Audio" && (
            <Text className='text-xs opacity-50'>{item?.Album}</Text>
          )}
        </View>
        <View className='flex flex-row space-x-2'>
          <SkipButton
            showButton={showSkipButton}
            onPress={onSkipIntro}
            buttonText='Skip Intro'
          />
          <SkipButton
            showButton={showSkipCreditButton}
            onPress={onSkipCredit}
            buttonText='Skip Credits'
          />
          {(settings.maxAutoPlayEpisodeCount.value === -1 ||
            settings.autoPlayEpisodeCount <
              settings.maxAutoPlayEpisodeCount.value) && (
            <NextEpisodeCountDownButton
              show={
                !nextItem
                  ? false
                  : isVlc
                    ? remainingTime < 10000
                    : remainingTime < 10
              }
              onFinish={onNextEpisodeAutoPlay}
              onPress={onNextEpisodeManual}
            />
          )}
        </View>
      </View>
      <View
        className={"flex flex-col-reverse rounded-lg items-center my-2"}
        pointerEvents={showControls ? "box-none" : "none"}
      >
        <View className={"flex flex-col w-full shrink"}>
          <View
            style={{
              height: SLIDER_CONFIG.HEIGHT,
              justifyContent: "center",
              alignItems: "stretch",
            }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <Animated.View style={animatedSliderStyle}>
              <Slider
                theme={SLIDER_THEME}
                renderThumb={() => null}
                cache={cacheProgress}
                onSlidingStart={onSliderStart}
                onSlidingComplete={onSliderComplete}
                onValueChange={onSliderChange}
                containerStyle={{
                  borderRadius: SLIDER_CONFIG.BORDER_RADIUS,
                }}
                renderBubble={() =>
                  (isSliding || showRemoteBubble) && renderTrickplayBubble()
                }
                sliderHeight={SLIDER_CONFIG.HEIGHT}
                thumbWidth={SLIDER_CONFIG.THUMB_WIDTH}
                progress={effectiveProgress}
                minimumValue={min}
                maximumValue={max}
              />
            </Animated.View>
          </View>
          <View className='flex flex-row items-center justify-between mt-2'>
            <Text className='text-[12px] text-neutral-400'>
              {formatTimeString(currentTime, isVlc ? "ms" : "s")}
            </Text>
            <View className='flex flex-col items-end'>
              <Text className='text-[12px] text-neutral-400'>
                -{formatTimeString(remainingTime, isVlc ? "ms" : "s")}
              </Text>
              <Text className='text-[10px] text-neutral-500 opacity-70'>
                ends at {getEndTime()}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};
