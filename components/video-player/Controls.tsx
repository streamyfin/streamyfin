import { useAdjacentItems } from "@/hooks/useAdjacentEpisodes";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { useTrickplay } from "@/hooks/useTrickplay";
import { usePlaySettings } from "@/providers/PlaySettingsProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { writeToLog } from "@/utils/log";
import { formatTimeString, ticksToSeconds } from "@/utils/time";
import { Ionicons } from "@expo/vector-icons";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoRef } from "react-native-video";
import { Text } from "../common/Text";
import { Loader } from "../Loader";

interface Props {
  item: BaseItemDto;
  videoRef: React.MutableRefObject<VideoRef | null>;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering: boolean;
  showControls: boolean;
  ignoreSafeAreas?: boolean;
  setIgnoreSafeAreas: React.Dispatch<React.SetStateAction<boolean>>;
  enableTrickplay?: boolean;
  togglePlay: (ticks: number) => void;
  setShowControls: (shown: boolean) => void;
}

export const Controls: React.FC<Props> = ({
  item,
  videoRef,
  togglePlay,
  isPlaying,
  isSeeking,
  progress,
  isBuffering,
  cacheProgress,
  showControls,
  setShowControls,
  ignoreSafeAreas,
  setIgnoreSafeAreas,
  enableTrickplay = true,
}) => {
  const [settings] = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setPlaySettings } = usePlaySettings();

  const windowDimensions = Dimensions.get("window");

  const { previousItem, nextItem } = useAdjacentItems({ item });
  const { trickPlayUrl, calculateTrickplayUrl, trickplayInfo } = useTrickplay(
    item,
    enableTrickplay
  );

  const [currentTime, setCurrentTime] = useState(0); // Seconds
  const [remainingTime, setRemainingTime] = useState(0); // Seconds

  const min = useSharedValue(0);
  const max = useSharedValue(item.RunTimeTicks || 0);

  const wasPlayingRef = useRef(false);

  const { showSkipButton, skipIntro } = useIntroSkipper(
    item.Id,
    currentTime,
    videoRef
  );

  const { showSkipCreditButton, skipCredit } = useCreditSkipper(
    item.Id,
    currentTime,
    videoRef
  );

  const goToPreviousItem = useCallback(() => {
    if (!previousItem || !settings) return;

    const { bitrate, mediaSource, audioIndex, subtitleIndex } =
      getDefaultPlaySettings(previousItem, settings);

    setPlaySettings({
      item: previousItem,
      bitrate,
      mediaSource,
      audioIndex,
      subtitleIndex,
    });

    router.replace("/play-video");
  }, [previousItem, settings]);

  const goToNextItem = useCallback(() => {
    if (!nextItem || !settings) return;

    const { bitrate, mediaSource, audioIndex, subtitleIndex } =
      getDefaultPlaySettings(nextItem, settings);

    setPlaySettings({
      item: nextItem,
      bitrate,
      mediaSource,
      audioIndex,
      subtitleIndex,
    });

    router.replace("/play-video");
  }, [nextItem, settings]);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = ticksToSeconds(currentProgress);
      const remaining = ticksToSeconds(maxValue - currentProgress);

      setCurrentTime(current);
      setRemainingTime(remaining);

      if (currentProgress === maxValue) {
        setShowControls(true);
        // Automatically play the next item if it exists
        goToNextItem();
      }
    },
    [goToNextItem]
  );

  useAnimatedReaction(
    () => ({
      progress: progress.value,
      max: max.value,
      isSeeking: isSeeking.value,
    }),
    (result) => {
      if (result.isSeeking === false) {
        runOnJS(updateTimes)(result.progress, result.max);
      }
    },
    [updateTimes]
  );

  useEffect(() => {
    if (item) {
      progress.value = item?.UserData?.PlaybackPositionTicks || 0;
      max.value = item.RunTimeTicks || 0;
    }
  }, [item]);

  const toggleControls = () => setShowControls(!showControls);

  const handleSliderComplete = useCallback((value: number) => {
    progress.value = value;
    isSeeking.value = false;
    videoRef.current?.seek(Math.max(0, Math.floor(value / 10000000)));
    if (wasPlayingRef.current === true) videoRef.current?.resume();
  }, []);

  const handleSliderChange = (value: number) => {
    calculateTrickplayUrl(value);
  };

  const handleSliderStart = useCallback(() => {
    if (showControls === false) return;
    wasPlayingRef.current = isPlaying;
    videoRef.current?.pause();
    isSeeking.value = true;
  }, [showControls, isPlaying]);

  const handleSkipBackward = useCallback(async () => {
    console.log("handleSkipBackward");
    if (!settings?.rewindSkipTime) return;
    wasPlayingRef.current = isPlaying;
    try {
      const curr = await videoRef.current?.getCurrentPosition();
      if (curr !== undefined) {
        videoRef.current?.seek(Math.max(0, curr - settings.rewindSkipTime));
        setTimeout(() => {
          if (wasPlayingRef.current === true) videoRef.current?.resume();
        }, 10);
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying]);

  const handleSkipForward = useCallback(async () => {
    console.log("handleSkipForward");
    if (!settings?.forwardSkipTime) return;
    wasPlayingRef.current = isPlaying;
    try {
      const curr = await videoRef.current?.getCurrentPosition();
      if (curr !== undefined) {
        videoRef.current?.seek(Math.max(0, curr + settings.forwardSkipTime));
        setTimeout(() => {
          if (wasPlayingRef.current === true) videoRef.current?.resume();
        }, 10);
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying]);

  const toggleIgnoreSafeAreas = useCallback(() => {
    setIgnoreSafeAreas((prev) => !prev);
  }, []);

  return (
    <View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: windowDimensions.width,
          height: windowDimensions.height,
        },
      ]}
    >
      <View
        style={[
          {
            position: "absolute",
            bottom: insets.bottom + 97,
            right: insets.right,
          },
        ]}
        className={`z-10 p-4
          ${showSkipButton ? "opacity-100" : "opacity-0"}
        `}
      >
        <TouchableOpacity
          onPress={skipIntro}
          className="bg-purple-600 rounded-full px-2.5 py-2 font-semibold"
        >
          <Text className="text-white">Skip Intro</Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          position: "absolute",
          bottom: insets.bottom + 94,
          right: insets.right,
          height: 70,
        }}
        pointerEvents={showSkipCreditButton ? "auto" : "none"}
        className={`z-10 p-4 ${
          showSkipCreditButton ? "opacity-100" : "opacity-0"
        }`}
      >
        <TouchableOpacity
          onPress={skipCredit}
          className="bg-purple-600 rounded-full px-2.5 py-2 font-semibold"
        >
          <Text className="text-white">Skip Credits</Text>
        </TouchableOpacity>
      </View>

      <Pressable
        onPress={() => {
          toggleControls();
        }}
      >
        <View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              width: windowDimensions.width + 100,
              height: windowDimensions.height + 100,
            },
          ]}
          className={`bg-black/50 z-0`}
        ></View>
      </Pressable>

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: windowDimensions.width,
          height: windowDimensions.height,
        }}
        pointerEvents="none"
        className={`flex flex-col items-center justify-center
            ${isBuffering ? "opacity-100" : "opacity-0"}
          `}
      >
        <Loader />
      </View>

      <View
        style={[
          {
            position: "absolute",
            top: insets.top,
            right: insets.right,
            opacity: showControls ? 1 : 0,
          },
        ]}
        pointerEvents={showControls ? "auto" : "none"}
        className={`flex flex-row items-center space-x-2 z-10 p-4`}
      >
        <TouchableOpacity
          onPress={toggleIgnoreSafeAreas}
          className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
        >
          <Ionicons
            name={ignoreSafeAreas ? "contract-outline" : "expand"}
            size={24}
            color="white"
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            router.back();
          }}
          className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
        >
          <Ionicons name="close" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <View
        style={[
          {
            position: "absolute",
            width: windowDimensions.width - insets.left - insets.right,
            maxHeight: windowDimensions.height,
            left: insets.left,
            bottom: Platform.OS === "ios" ? insets.bottom : insets.bottom,
            opacity: showControls ? 1 : 0,
          },
        ]}
        pointerEvents={showControls ? "auto" : "none"}
        className={`flex flex-col p-4 `}
      >
        <View className="shrink flex flex-col justify-center h-full mb-2">
          <Text className="font-bold">{item?.Name}</Text>
          {item?.Type === "Episode" && (
            <Text className="opacity-50">{item.SeriesName}</Text>
          )}
          {item?.Type === "Movie" && (
            <Text className="text-xs opacity-50">{item?.ProductionYear}</Text>
          )}
          {item?.Type === "Audio" && (
            <Text className="text-xs opacity-50">{item?.Album}</Text>
          )}
        </View>
        <View
          className={`flex flex-col-reverse py-4 px-4 rounded-2xl items-center  bg-neutral-800/90`}
        >
          <View className="flex flex-row items-center space-x-4">
            <TouchableOpacity
              style={{
                opacity: !previousItem ? 0.5 : 1,
              }}
              onPress={goToPreviousItem}
            >
              <Ionicons name="play-skip-back" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSkipBackward}>
              <Ionicons
                name="refresh-outline"
                size={26}
                color="white"
                style={{
                  transform: [{ scaleY: -1 }, { rotate: "180deg" }],
                }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                togglePlay(progress.value);
              }}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={30}
                color="white"
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSkipForward}>
              <Ionicons name="refresh-outline" size={26} color="white" />
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                opacity: !nextItem ? 0.5 : 1,
              }}
              onPress={goToNextItem}
            >
              <Ionicons name="play-skip-forward" size={24} color="white" />
            </TouchableOpacity>
          </View>
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
                {formatTimeString(currentTime)}
              </Text>
              <Text className="text-[12px] text-neutral-400">
                -{formatTimeString(remainingTime)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};
