import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useAdjacentItems } from "@/hooks/useAdjacentEpisodes";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useHaptic } from "@/hooks/useHaptic";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { useTrickplay } from "@/hooks/useTrickplay";
import {
  TrackInfo,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import {
  getDefaultPlaySettings,
  previousIndexes,
} from "@/utils/jellyfin/getDefaultPlaySettings";
import { getItemById } from "@/utils/jellyfin/user-library/getItemById";
import { writeToLog } from "@/utils/log";
import {
  formatTimeString,
  msToTicks,
  secondsToMs,
  ticksToMs,
  ticksToSeconds,
} from "@/utils/time";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { useAtom } from "jotai";
import { debounce } from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VideoRef } from "react-native-video";
import AudioSlider from "./AudioSlider";
import BrightnessSlider from "./BrightnessSlider";
import { ControlProvider } from "./contexts/ControlContext";
import { VideoProvider } from "./contexts/VideoContext";
import DropdownView from "./dropdown/DropdownView";
import { EpisodeList } from "./EpisodeList";
import NextEpisodeCountDownButton from "./NextEpisodeCountDownButton";
import SkipButton from "./SkipButton";
import { useControlsTimeout } from "./useControlsTimeout";
import { VideoTouchOverlay } from "./VideoTouchOverlay";

interface Props {
  item: BaseItemDto;
  videoRef: React.MutableRefObject<VlcPlayerViewRef | VideoRef | null>;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering: boolean;
  showControls: boolean;
  ignoreSafeAreas?: boolean;
  setIgnoreSafeAreas: React.Dispatch<React.SetStateAction<boolean>>;
  enableTrickplay?: boolean;
  togglePlay: () => void;
  setShowControls: (shown: boolean) => void;
  offline?: boolean;
  isVideoLoaded?: boolean;
  mediaSource?: MediaSourceInfo | null;
  seek: (ticks: number) => void;
  startPictureInPicture: () => Promise<void>;
  play: (() => Promise<void>) | (() => void);
  pause: () => void;
  getAudioTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  getSubtitleTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  setSubtitleURL?: (url: string, customName: string) => void;
  setSubtitleTrack?: (index: number) => void;
  setAudioTrack?: (index: number) => void;
  stop: (() => Promise<void>) | (() => void);
  isVlc?: boolean;
}

const CONTROLS_TIMEOUT = 4000;

export const Controls: React.FC<Props> = ({
  item,
  seek,
  startPictureInPicture,
  play,
  pause,
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
  mediaSource,
  isVideoLoaded,
  getAudioTracks,
  getSubtitleTracks,
  setSubtitleURL,
  setSubtitleTrack,
  setAudioTrack,
  stop,
  offline = false,
  enableTrickplay = true,
  isVlc = false,
}) => {
  const [settings] = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [api] = useAtom(apiAtom);

  const [episodeView, setEpisodeView] = useState(false);
  const [isSliding, setIsSliding] = useState(false);

  // Used when user changes audio through audio button on device.
  const [showAudioSlider, setShowAudioSlider] = useState(false);

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { previousItem, nextItem } = useAdjacentItems({ item });
  const {
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
    prefetchAllTrickplayImages,
  } = useTrickplay(item, !offline && enableTrickplay);

  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(Infinity);

  const min = useSharedValue(0);
  const max = useSharedValue(item.RunTimeTicks || 0);

  const wasPlayingRef = useRef(false);
  const lastProgressRef = useRef<number>(0);

  const lightHapticFeedback = useHaptic("light");

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, []);

  useEffect(() => {
    if (item) {
      progress.value = isVlc
        ? ticksToMs(item?.UserData?.PlaybackPositionTicks)
        : item?.UserData?.PlaybackPositionTicks || 0;
      max.value = isVlc
        ? ticksToMs(item.RunTimeTicks || 0)
        : item.RunTimeTicks || 0;
    }
  }, [item, isVlc]);

  const { bitrateValue, subtitleIndex, audioIndex } = useLocalSearchParams<{
    bitrateValue: string;
    audioIndex: string;
    subtitleIndex: string;
  }>();

  const { showSkipButton, skipIntro } = useIntroSkipper(
    offline ? undefined : item.Id,
    currentTime,
    seek,
    play,
    isVlc
  );

  const { showSkipCreditButton, skipCredit } = useCreditSkipper(
    offline ? undefined : item.Id,
    currentTime,
    seek,
    play,
    isVlc
  );

  const goToPreviousItem = useCallback(() => {
    if (!previousItem || !settings) return;

    lightHapticFeedback();

    const previousIndexes: previousIndexes = {
      subtitleIndex: subtitleIndex ? parseInt(subtitleIndex) : undefined,
      audioIndex: audioIndex ? parseInt(audioIndex) : undefined,
    };

    const {
      mediaSource: newMediaSource,
      audioIndex: defaultAudioIndex,
      subtitleIndex: defaultSubtitleIndex,
    } = getDefaultPlaySettings(
      previousItem,
      settings,
      previousIndexes,
      mediaSource ?? undefined
    );

    const queryParams = new URLSearchParams({
      itemId: previousItem.Id ?? "", // Ensure itemId is a string
      audioIndex: defaultAudioIndex?.toString() ?? "",
      subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
      mediaSourceId: newMediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrateValue.toString(),
    }).toString();

    stop();

    // @ts-expect-error
    router.replace(`player/direct-player?${queryParams}`);
  }, [previousItem, settings, subtitleIndex, audioIndex]);

  const goToNextItem = useCallback(() => {
    if (!nextItem || !settings) return;

    lightHapticFeedback();

    const previousIndexes: previousIndexes = {
      subtitleIndex: subtitleIndex ? parseInt(subtitleIndex) : undefined,
      audioIndex: audioIndex ? parseInt(audioIndex) : undefined,
    };

    const {
      mediaSource: newMediaSource,
      audioIndex: defaultAudioIndex,
      subtitleIndex: defaultSubtitleIndex,
    } = getDefaultPlaySettings(
      nextItem,
      settings,
      previousIndexes,
      mediaSource ?? undefined
    );

    const queryParams = new URLSearchParams({
      itemId: nextItem.Id ?? "", // Ensure itemId is a string
      audioIndex: defaultAudioIndex?.toString() ?? "",
      subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
      mediaSourceId: newMediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrateValue.toString(),
    }).toString();

    stop();

    // @ts-expect-error
    router.replace(`player/direct-player?${queryParams}`);
  }, [nextItem, settings, subtitleIndex, audioIndex]);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = isVlc ? currentProgress : ticksToSeconds(currentProgress);
      const remaining = isVlc
        ? maxValue - currentProgress
        : ticksToSeconds(maxValue - currentProgress);

      setCurrentTime(current);
      setRemainingTime(remaining);
    },
    [goToNextItem, isVlc]
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

  const hideControls = useCallback(() => {
    setShowControls(false);
    setShowAudioSlider(false);
  }, []);

  const { handleControlsInteraction } = useControlsTimeout({
    showControls,
    isSliding,
    episodeView,
    onHideControls: hideControls,
    timeout: CONTROLS_TIMEOUT,
  });

  const toggleControls = () => {
    if (showControls) {
      setShowAudioSlider(false);
      setShowControls(false);
    } else {
      setShowControls(true);
    }
  };

  const handleSliderStart = useCallback(() => {
    if (showControls === false) return;

    setIsSliding(true);
    wasPlayingRef.current = isPlaying;
    lastProgressRef.current = progress.value;

    pause();
    isSeeking.value = true;
  }, [showControls, isPlaying]);

  const handleSliderComplete = useCallback(
    async (value: number) => {
      isSeeking.value = false;
      progress.value = value;
      setIsSliding(false);

      seek(Math.max(0, Math.floor(isVlc ? value : ticksToSeconds(value))));
      if (wasPlayingRef.current === true) play();
    },
    [isVlc]
  );

  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const handleSliderChange = useCallback(
    debounce((value: number) => {
      const progressInTicks = isVlc ? msToTicks(value) : value;
      calculateTrickplayUrl(progressInTicks);
      const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
      const hours = Math.floor(progressInSeconds / 3600);
      const minutes = Math.floor((progressInSeconds % 3600) / 60);
      const seconds = progressInSeconds % 60;
      setTime({ hours, minutes, seconds });
    }, 3),
    []
  );

  const handleSkipBackward = useCallback(async () => {
    if (!settings?.rewindSkipTime) return;
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? Math.max(0, curr - secondsToMs(settings.rewindSkipTime))
          : Math.max(0, ticksToSeconds(curr) - settings.rewindSkipTime);
        seek(newTime);
        if (wasPlayingRef.current === true) play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying, isVlc]);

  const handleSkipForward = useCallback(async () => {
    if (!settings?.forwardSkipTime) return;
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? curr + secondsToMs(settings.forwardSkipTime)
          : ticksToSeconds(curr) + settings.forwardSkipTime;
        seek(Math.max(0, newTime));
        if (wasPlayingRef.current === true) play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying, isVlc]);

  const goToItem = useCallback(
    async (itemId: string) => {
      try {
        const gotoItem = await getItemById(api, itemId);
        if (!settings || !gotoItem) return;

        lightHapticFeedback();

        const previousIndexes: previousIndexes = {
          subtitleIndex: subtitleIndex ? parseInt(subtitleIndex) : undefined,
          audioIndex: audioIndex ? parseInt(audioIndex) : undefined,
        };

        const {
          mediaSource: newMediaSource,
          audioIndex: defaultAudioIndex,
          subtitleIndex: defaultSubtitleIndex,
        } = getDefaultPlaySettings(
          gotoItem,
          settings,
          previousIndexes,
          mediaSource ?? undefined
        );

        const queryParams = new URLSearchParams({
          itemId: gotoItem.Id ?? "", // Ensure itemId is a string
          audioIndex: defaultAudioIndex?.toString() ?? "",
          subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
          mediaSourceId: newMediaSource?.Id ?? "", // Ensure mediaSourceId is a string
          bitrateValue: bitrateValue.toString(),
        }).toString();

        stop();

        // @ts-expect-error
        router.replace(`player/direct-player?${queryParams}`);
      } catch (error) {
        console.error("Error in gotoEpisode:", error);
      }
    },
    [settings, subtitleIndex, audioIndex]
  );

  const toggleIgnoreSafeAreas = useCallback(() => {
    setIgnoreSafeAreas((prev) => !prev);
    lightHapticFeedback();
  }, []);

  const switchOnEpisodeMode = useCallback(() => {
    setEpisodeView(true);
    if (isPlaying) togglePlay();
  }, [isPlaying, togglePlay]);

  const memoizedRenderBubble = useCallback(() => {
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
          className="bg-neutral-800 overflow-hidden"
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
              resizeMode: "cover",
            }}
            source={{ uri: url }}
            contentFit="cover"
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
  }, [trickPlayUrl, trickplayInfo, time]);

  const onClose = async () => {
    stop();
    lightHapticFeedback();
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    );
    router.back();
  };

  return (
    <ControlProvider
      item={item}
      mediaSource={mediaSource}
      isVideoLoaded={isVideoLoaded}
    >
      {episodeView ? (
        <EpisodeList
          item={item}
          close={() => setEpisodeView(false)}
          goToItem={goToItem}
        />
      ) : (
        <>
          <VideoTouchOverlay
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            showControls={showControls}
            onToggleControls={toggleControls}
          />
          <View
            style={[
              {
                position: "absolute",
                top: settings?.safeAreaInControlsEnabled ? insets.top : 0,
                right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
                width: settings?.safeAreaInControlsEnabled
                  ? screenWidth - insets.left - insets.right
                  : screenWidth,
                opacity: showControls ? 1 : 0,
              },
            ]}
            pointerEvents={showControls ? "auto" : "none"}
            className={`flex flex-row w-full pt-2`}
          >
            {!Platform.isTV && (
              <View className="mr-auto">
                <VideoProvider
                  getAudioTracks={getAudioTracks}
                  getSubtitleTracks={getSubtitleTracks}
                  setAudioTrack={setAudioTrack}
                  setSubtitleTrack={setSubtitleTrack}
                  setSubtitleURL={setSubtitleURL}
                >
                  <DropdownView showControls={showControls} />
                </VideoProvider>
              </View>
            )}

            <View className="flex flex-row items-center space-x-2 ">
              {!Platform.isTV && (
                <TouchableOpacity
                  onPress={startPictureInPicture}
                  className="aspect-square flex flex-col rounded-xl items-center justify-center p-2"
                >
                  <MaterialIcons
                    name="picture-in-picture"
                    size={24}
                    color="white"
                    style={{ opacity: showControls ? 1 : 0 }}
                  />
                </TouchableOpacity>
              )}

              {item?.Type === "Episode" && !offline && (
                <TouchableOpacity
                  onPress={() => {
                    switchOnEpisodeMode();
                  }}
                  className="aspect-square flex flex-col rounded-xl items-center justify-center p-2"
                >
                  <Ionicons name="list" size={24} color="white" />
                </TouchableOpacity>
              )}
              {previousItem && !offline && (
                <TouchableOpacity
                  onPress={goToPreviousItem}
                  className="aspect-square flex flex-col rounded-xl items-center justify-center p-2"
                >
                  <Ionicons name="play-skip-back" size={24} color="white" />
                </TouchableOpacity>
              )}

              {nextItem && !offline && (
                <TouchableOpacity
                  onPress={goToNextItem}
                  className="aspect-square flex flex-col rounded-xl items-center justify-center p-2"
                >
                  <Ionicons name="play-skip-forward" size={24} color="white" />
                </TouchableOpacity>
              )}

              {/* {mediaSource?.TranscodingUrl && ( */}
              <TouchableOpacity
                onPress={toggleIgnoreSafeAreas}
                className="aspect-square flex flex-col rounded-xl items-center justify-center p-2"
              >
                <Ionicons
                  name={ignoreSafeAreas ? "contract-outline" : "expand"}
                  size={24}
                  color="white"
                />
              </TouchableOpacity>
              {/* )} */}
              <TouchableOpacity
                onPress={onClose}
                className="aspect-square flex flex-col rounded-xl items-center justify-center p-2"
              >
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={{
              position: "absolute",
              top: "50%", // Center vertically
              left: settings?.safeAreaInControlsEnabled ? insets.left : 0,
              right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              transform: [{ translateY: -22.5 }], // Adjust for the button's height (half of 45)
              paddingHorizontal: "28%", // Add some padding to the left and right
            }}
            pointerEvents={showControls ? "box-none" : "none"}
          >
            <View
              style={{
                position: "absolute",
                alignItems: "center",
                transform: [{ rotate: "270deg" }], // Rotate the slider to make it vertical
                left: 0,
                bottom: 30,
                opacity: showControls ? 1 : 0,
              }}
            >
              <BrightnessSlider />
            </View>
            <TouchableOpacity onPress={handleSkipBackward}>
              <View
                style={{
                  position: "relative",
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: showControls ? 1 : 0,
                }}
              >
                <Ionicons
                  name="refresh-outline"
                  size={50}
                  color="white"
                  style={{
                    transform: [{ scaleY: -1 }, { rotate: "180deg" }],
                  }}
                />
                <Text
                  style={{
                    position: "absolute",
                    color: "white",
                    fontSize: 16,
                    fontWeight: "bold",
                    bottom: 10,
                  }}
                >
                  {settings?.rewindSkipTime}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                togglePlay();
              }}
            >
              {!isBuffering ? (
                <Ionicons
                  name={isPlaying ? "pause" : "play"}
                  size={50}
                  color="white"
                  style={{
                    opacity: showControls ? 1 : 0,
                  }}
                />
              ) : (
                <Loader size={"large"} />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSkipForward}>
              <View
                style={{
                  position: "relative",
                  justifyContent: "center",
                  alignItems: "center",
                  opacity: showControls ? 1 : 0,
                }}
              >
                <Ionicons name="refresh-outline" size={50} color="white" />
                <Text
                  style={{
                    position: "absolute",
                    color: "white",
                    fontSize: 16,
                    fontWeight: "bold",
                    bottom: 10,
                  }}
                >
                  {settings?.forwardSkipTime}
                </Text>
              </View>
            </TouchableOpacity>

            <View
              style={{
                position: "absolute",
                alignItems: "center",
                transform: [{ rotate: "270deg" }], // Rotate the slider to make it vertical
                bottom: 30,
                right: 0,
                opacity: showAudioSlider || showControls ? 1 : 0,
              }}
            >
              <AudioSlider setVisibility={setShowAudioSlider} />
            </View>
          </View>

          <View
            style={[
              {
                position: "absolute",
                right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
                left: settings?.safeAreaInControlsEnabled ? insets.left : 0,
                bottom: settings?.safeAreaInControlsEnabled ? insets.bottom : 0,
              },
            ]}
            className={`flex flex-col px-2`}
            onTouchStart={handleControlsInteraction}
          >
            <View
              className="shrink flex flex-col justify-center h-full"
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "column",
                  alignSelf: "flex-end", // Shrink height based on content
                  opacity: showControls ? 1 : 0,
                }}
                pointerEvents={showControls ? "box-none" : "none"}
              >
                {item?.Type === "Episode" && (
                  <Text className="opacity-50">
                    {`${item.SeriesName} - ${item.SeasonName} Episode ${item.IndexNumber}`}
                  </Text>
                )}
                <Text className="font-bold text-xl">{item?.Name}</Text>
                {item?.Type === "Movie" && (
                  <Text className="text-xs opacity-50">
                    {item?.ProductionYear}
                  </Text>
                )}
                {item?.Type === "Audio" && (
                  <Text className="text-xs opacity-50">{item?.Album}</Text>
                )}
              </View>
              <View className="flex flex-row space-x-2">
                <SkipButton
                  showButton={showSkipButton}
                  onPress={skipIntro}
                  buttonText="Skip Intro"
                />
                <SkipButton
                  showButton={showSkipCreditButton}
                  onPress={skipCredit}
                  buttonText="Skip Credits"
                />
                <NextEpisodeCountDownButton
                  show={
                    !nextItem
                      ? false
                      : isVlc
                      ? remainingTime < 10000
                      : remainingTime < 10
                  }
                  onFinish={goToNextItem}
                  onPress={goToNextItem}
                />
              </View>
            </View>
            <View
              className={`flex flex-col-reverse rounded-lg items-center my-2`}
              style={{
                opacity: showControls ? 1 : 0,
              }}
              pointerEvents={showControls ? "box-none" : "none"}
            >
              <View className={`flex flex-col w-full shrink`}>
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
                  renderBubble={() => isSliding && memoizedRenderBubble()}
                  sliderHeight={10}
                  thumbWidth={0}
                  progress={progress}
                  minimumValue={min}
                  maximumValue={max}
                />
                <View className="flex flex-row items-center justify-between mt-2">
                  <Text className="text-[12px] text-neutral-400">
                    {formatTimeString(currentTime, isVlc ? "ms" : "s")}
                  </Text>
                  <Text className="text-[12px] text-neutral-400">
                    -{formatTimeString(remainingTime, isVlc ? "ms" : "s")}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </>
      )}
    </ControlProvider>
  );
};
