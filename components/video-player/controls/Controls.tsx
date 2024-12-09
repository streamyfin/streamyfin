import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useAdjacentItems } from "@/hooks/useAdjacentEpisodes";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { useTrickplay } from "@/hooks/useTrickplay";
import {
  TrackInfo,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { writeToLog } from "@/utils/log";
import {
  formatTimeString,
  msToTicks,
  secondsToMs,
  ticksToMs,
  ticksToSeconds,
} from "@/utils/time";
import { Ionicons } from "@expo/vector-icons";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { VideoRef } from "react-native-video";
import { ControlProvider } from "./contexts/ControlContext";
import { VideoProvider } from "./contexts/VideoContext";
import * as Haptics from "expo-haptics";
import DropdownViewDirect from "./dropdown/DropdownViewDirect";
import DropdownViewTranscoding from "./dropdown/DropdownViewTranscoding";
import BrightnessSlider from "./BrightnessSlider";
import SkipButton from "./SkipButton";
import { debounce } from "lodash";
import { EpisodeList } from "./EpisodeList";
import { BlurView } from "expo-blur";
import { getItemById } from "@/utils/jellyfin/user-library/getItemById";
import { useAtom } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import AudioSlider from "./AudioSlider";

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
  play: (() => Promise<void>) | (() => void);
  pause: () => void;
  getAudioTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  getSubtitleTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  setSubtitleURL?: (url: string, customName: string) => void;
  setSubtitleTrack?: (index: number) => void;
  setAudioTrack?: (index: number) => void;
  stop?: (() => Promise<void>) | (() => void);
  isVlc?: boolean;
}

export const Controls: React.FC<Props> = ({
  item,
  seek,
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

  const { previousItem, nextItem } = useAdjacentItems({ item });
  const {
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
    prefetchAllTrickplayImages,
  } = useTrickplay(item, !offline && enableTrickplay);

  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);

  const min = useSharedValue(0);
  const max = useSharedValue(item.RunTimeTicks || 0);

  const wasPlayingRef = useRef(false);
  const lastProgressRef = useRef<number>(0);

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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { bitrate, mediaSource, audioIndex, subtitleIndex } =
      getDefaultPlaySettings(previousItem, settings);

    const queryParams = new URLSearchParams({
      itemId: previousItem.Id ?? "", // Ensure itemId is a string
      audioIndex: audioIndex?.toString() ?? "",
      subtitleIndex: subtitleIndex?.toString() ?? "",
      mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrate.toString(),
    }).toString();

    if (!bitrate.value) {
      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
      return;
    }
    // @ts-expect-error
    router.replace(`player/transcoding-player?${queryParams}`);
  }, [previousItem, settings]);

  const goToNextItem = useCallback(() => {
    if (!nextItem || !settings) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { bitrate, mediaSource, audioIndex, subtitleIndex } =
      getDefaultPlaySettings(nextItem, settings);

    const queryParams = new URLSearchParams({
      itemId: nextItem.Id ?? "", // Ensure itemId is a string
      audioIndex: audioIndex?.toString() ?? "",
      subtitleIndex: subtitleIndex?.toString() ?? "",
      mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrate.toString(),
    }).toString();

    if (!bitrate.value) {
      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
      return;
    }
    // @ts-expect-error
    router.replace(`player/transcoding-player?${queryParams}`);
  }, [nextItem, settings]);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = isVlc ? currentProgress : ticksToSeconds(currentProgress);
      const remaining = isVlc
        ? maxValue - currentProgress
        : ticksToSeconds(maxValue - currentProgress);

      setCurrentTime(current);
      setRemainingTime(remaining);

      // Currently doesm't work in VLC because of some corrupted timestamps, will need to find a workaround.
      if (currentProgress === maxValue) {
        setShowControls(true);
        // Automatically play the next item if it exists
        goToNextItem();
      }
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
      // console.log("Progress changed", result);
      if (result.isSeeking === false) {
        runOnJS(updateTimes)(result.progress, result.max);
      }
    },
    [updateTimes]
  );

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

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, []);
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

  const [isSliding, setIsSliding] = useState(false);
  const handleSliderComplete = useCallback(
    async (value: number) => {
      isSeeking.value = false;
      progress.value = value;
      setIsSliding(false);

      await seek(
        Math.max(0, Math.floor(isVlc ? value : ticksToSeconds(value)))
      );
      if (wasPlayingRef.current === true) play();
    },
    [isVlc]
  );

  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const handleSliderChange = useCallback(
    debounce((value: number) => {
      const progressInTicks = msToTicks(value);
      console.log("Progress in ticks", progressInTicks);
      calculateTrickplayUrl(progressInTicks);

      const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
      const hours = Math.floor(progressInSeconds / 3600);
      const minutes = Math.floor((progressInSeconds % 3600) / 60);
      const seconds = progressInSeconds % 60;
      setTime({ hours, minutes, seconds });
    }, 10),
    []
  );

  const handleSkipBackward = useCallback(async () => {
    if (!settings?.rewindSkipTime) return;
    wasPlayingRef.current = isPlaying;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? Math.max(0, curr - secondsToMs(settings.rewindSkipTime))
          : Math.max(0, ticksToSeconds(curr) - settings.rewindSkipTime);
        await seek(newTime);
        if (wasPlayingRef.current === true) play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying, isVlc]);

  const handleSkipForward = useCallback(async () => {
    if (!settings?.forwardSkipTime) return;
    wasPlayingRef.current = isPlaying;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const curr = progress.value;
      console.log(curr);
      if (curr !== undefined) {
        const newTime = isVlc
          ? curr + secondsToMs(settings.forwardSkipTime)
          : ticksToSeconds(curr) + settings.forwardSkipTime;
        await seek(Math.max(0, newTime));
        if (wasPlayingRef.current === true) play();
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying, isVlc]);

  const toggleIgnoreSafeAreas = useCallback(() => {
    setIgnoreSafeAreas((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const memoizedRenderBubble = useCallback(() => {
    if (!trickPlayUrl || !trickplayInfo) {
      return null;
    }
    const { x, y, url } = trickPlayUrl;
    const tileWidth = 150;
    const tileHeight = 150 / trickplayInfo.aspectRatio!;

    console.log("time, ", time);

    return (
      <View
        style={{
          position: "absolute",
          left: -57,
          bottom: 15,
          paddingTop: 30,
          paddingBottom: 5,
          width: tileWidth * 1.5,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
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

  const [EpisodeView, setEpisodeView] = useState(false);

  const switchOnEpisodeMode = () => {
    setEpisodeView(true);
    if (isPlaying) togglePlay(progress.value);
  };

  const gotoEpisode = async (itemId: string) => {
    const item = await getItemById(api, itemId);
    console.log("Item", item);
    if (!settings || !item) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { bitrate, mediaSource, audioIndex, subtitleIndex } =
      getDefaultPlaySettings(item, settings);

    const queryParams = new URLSearchParams({
      itemId: item.Id ?? "", // Ensure itemId is a string
      audioIndex: audioIndex?.toString() ?? "",
      subtitleIndex: subtitleIndex?.toString() ?? "",
      mediaSourceId: mediaSource?.Id ?? "", // Ensure mediaSourceId is a string
      bitrateValue: bitrate.toString(),
    }).toString();

    if (!bitrate.value) {
      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
      return;
    }
    // @ts-expect-error
    router.replace(`player/transcoding-player?${queryParams}`);
  };

  // Used when user changes audio through audio button on device.
  const [showAudioSlider, setShowAudioSlider] = useState(false);

  return (
    <ControlProvider
      item={item}
      mediaSource={mediaSource}
      isVideoLoaded={isVideoLoaded}
    >
      {EpisodeView ? (
        <EpisodeList item={item} close={() => setEpisodeView(false)} />
      ) : (
        <>
          <VideoProvider
            getAudioTracks={getAudioTracks}
            getSubtitleTracks={getSubtitleTracks}
            setAudioTrack={setAudioTrack}
            setSubtitleTrack={setSubtitleTrack}
            setSubtitleURL={setSubtitleURL}
          >
            {!mediaSource?.TranscodingUrl ? (
              <DropdownViewDirect showControls={showControls} />
            ) : (
              <DropdownViewTranscoding showControls={showControls} />
            )}
          </VideoProvider>

          <Pressable
            onPressIn={() => {
              toggleControls();
            }}
            style={{
              position: "absolute",
              width: Dimensions.get("window").width,
              height: Dimensions.get("window").height,
            }}
          ></Pressable>

          <View
            style={[
              {
                position: "absolute",
                top: 0,
                right: 0,
                opacity: showControls ? 1 : 0,
              },
            ]}
            pointerEvents={showControls ? "auto" : "none"}
            className={`flex flex-row items-center space-x-2 z-10 p-4 `}
          >
            {item?.Type === "Episode" && (
              <TouchableOpacity
                onPress={() => {
                  switchOnEpisodeMode();
                }}
                className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
              >
                <Ionicons name="list" size={24} color="white" />
              </TouchableOpacity>
            )}
            {previousItem && (
              <TouchableOpacity
                onPress={goToPreviousItem}
                className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
              >
                <Ionicons name="play-skip-back" size={24} color="white" />
              </TouchableOpacity>
            )}

            {nextItem && (
              <TouchableOpacity
                onPress={goToNextItem}
                className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
              >
                <Ionicons name="play-skip-forward" size={24} color="white" />
              </TouchableOpacity>
            )}

            {mediaSource?.TranscodingUrl && (
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
            )}
            <TouchableOpacity
              onPress={async () => {
                router.back();
              }}
              className="aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2"
            >
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>

          <View
            style={{
              position: "absolute",
              top: "50%", // Center vertically
              left: 0,
              right: 0,
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
                right: 0,
                left: 0,
                bottom: 0,
                opacity: showControls ? 1 : 0,
              },
            ]}
            pointerEvents={showControls ? "box-none" : "none"}
            className={`flex flex-col p-4`}
          >
            <View
              className="shrink flex flex-col justify-center h-full mb-2"
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
              >
                <Text className="font-bold">{item?.Name}</Text>
                {item?.Type === "Episode" && (
                  <Text className="opacity-50">{item.SeriesName}</Text>
                )}
                {item?.Type === "Movie" && (
                  <Text className="text-xs opacity-50">
                    {item?.ProductionYear}
                  </Text>
                )}
                {item?.Type === "Audio" && (
                  <Text className="text-xs opacity-50">{item?.Album}</Text>
                )}
              </View>
              <View
                style={{
                  flexDirection: "column",
                  alignSelf: "flex-end",
                  marginRight: insets.right,
                }}
              >
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
              </View>
            </View>
            <View
              className={`flex flex-col-reverse py-4 pb-1 px-4 rounded-lg items-center  bg-neutral-800`}
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
                  renderThumb={() => (
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        left: -2,
                        borderRadius: 10,
                        backgroundColor: "#fff",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    />
                  )}
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
                <View className="flex flex-row items-center justify-between mt-0.5">
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
