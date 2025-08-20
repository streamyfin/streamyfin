import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { FC } from "react";
import { View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import { type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useSettings } from "@/utils/atoms/settings";
import NextEpisodeCountDownButton from "./NextEpisodeCountDownButton";
import SkipButton from "./SkipButton";
import { TimeDisplay } from "./TimeDisplay";
import { TrickplayBubble } from "./TrickplayBubble";

interface BottomControlsProps {
  item: BaseItemDto;
  showControls: boolean;
  isSliding: boolean;
  showRemoteBubble: boolean;
  currentTime: number;
  remainingTime: number;
  isVlc: boolean;
  showSkipButton: boolean;
  showSkipCreditButton: boolean;
  skipIntro: () => void;
  skipCredit: () => void;
  nextItem?: BaseItemDto | null;
  handleNextEpisodeAutoPlay: () => void;
  handleNextEpisodeManual: () => void;
  handleControlsInteraction: () => void;

  // Slider props
  min: SharedValue<number>;
  max: SharedValue<number>;
  effectiveProgress: SharedValue<number>;
  cacheProgress: SharedValue<number>;
  handleSliderStart: () => void;
  handleSliderComplete: (value: number) => void;
  handleSliderChange: (value: number) => void;
  handleTouchStart: () => void;
  handleTouchEnd: () => void;

  // Trickplay props
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

export const BottomControls: FC<BottomControlsProps> = ({
  item,
  showControls,
  isSliding,
  showRemoteBubble,
  currentTime,
  remainingTime,
  isVlc,
  showSkipButton,
  showSkipCreditButton,
  skipIntro,
  skipCredit,
  nextItem,
  handleNextEpisodeAutoPlay,
  handleNextEpisodeManual,
  handleControlsInteraction,
  min,
  max,
  effectiveProgress,
  cacheProgress,
  handleSliderStart,
  handleSliderComplete,
  handleSliderChange,
  handleTouchStart,
  handleTouchEnd,
  trickPlayUrl,
  trickplayInfo,
  time,
}) => {
  const [settings] = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          position: "absolute",
          right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
          left: settings?.safeAreaInControlsEnabled ? insets.left : 0,
          bottom: settings?.safeAreaInControlsEnabled
            ? Math.max(insets.bottom - 17, 0)
            : 0,
        },
      ]}
      className={"flex flex-col px-2"}
      onTouchStart={handleControlsInteraction}
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
            alignSelf: "flex-end",
            opacity: showControls ? 1 : 0,
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
            onPress={skipIntro}
            buttonText='Skip Intro'
          />
          <SkipButton
            showButton={showSkipCreditButton}
            onPress={skipCredit}
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
              onFinish={handleNextEpisodeAutoPlay}
              onPress={handleNextEpisodeManual}
            />
          )}
        </View>
      </View>
      <View
        className={"flex flex-col-reverse rounded-lg items-center my-2"}
        style={{
          opacity: showControls ? 1 : 0,
        }}
        pointerEvents={showControls ? "box-none" : "none"}
      >
        <View className={"flex flex-col w-full shrink"}>
          <View
            style={{
              height: 10,
              justifyContent: "center",
              alignItems: "stretch",
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Slider
              theme={{
                maximumTrackTintColor: "rgba(255,255,255,0.2)",
                minimumTrackTintColor: "#fff",
                cacheTrackTintColor: "rgba(255,255,255,0.3)",
                bubbleBackgroundColor: "#fff",
                bubbleTextColor: "#666",
                heartbeatColor: "#999",
              }}
              renderThumb={() => null}
              cache={cacheProgress}
              onSlidingStart={handleSliderStart}
              onSlidingComplete={handleSliderComplete}
              onValueChange={handleSliderChange}
              containerStyle={{
                borderRadius: 100,
              }}
              renderBubble={() =>
                (isSliding || showRemoteBubble) && (
                  <TrickplayBubble
                    trickPlayUrl={trickPlayUrl}
                    trickplayInfo={trickplayInfo}
                    time={time}
                  />
                )
              }
              sliderHeight={10}
              thumbWidth={0}
              progress={effectiveProgress}
              minimumValue={min}
              maximumValue={max}
            />
          </View>
          <TimeDisplay
            currentTime={currentTime}
            remainingTime={remainingTime}
            isVlc={isVlc}
          />
        </View>
      </View>
    </View>
  );
};
