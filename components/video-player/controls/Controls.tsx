import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { debounce } from "lodash";
import {
  type Dispatch,
  type FC,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Platform,
  TouchableOpacity,
  useTVEventHandler,
  useWindowDimensions,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import ContinueWatchingOverlay from "@/components/video-player/controls/ContinueWatchingOverlay";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useHaptic } from "@/hooks/useHaptic";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useTrickplay } from "@/hooks/useTrickplay";
import type { TrackInfo, VlcPlayerViewRef } from "@/modules/VlcPlayer.types";
import { useSettings, VideoPlayer } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { writeToLog } from "@/utils/log";
import {
  formatTimeString,
  msToTicks,
  secondsToMs,
  ticksToMs,
  ticksToSeconds,
} from "@/utils/time";
import AudioSlider from "./AudioSlider";
import BrightnessSlider from "./BrightnessSlider";
import { ControlProvider } from "./contexts/ControlContext";
import { VideoProvider } from "./contexts/VideoContext";
import DropdownView from "./dropdown/DropdownView";
import { EpisodeList } from "./EpisodeList";
import NextEpisodeCountDownButton from "./NextEpisodeCountDownButton";
import { type ScaleFactor, ScaleFactorSelector } from "./ScaleFactorSelector";
import SkipButton from "./SkipButton";
import { useControlsTimeout } from "./useControlsTimeout";
import {
  type AspectRatio,
  AspectRatioSelector,
} from "./VideoScalingModeSelector";
import { VideoTouchOverlay } from "./VideoTouchOverlay";

interface Props {
  item: BaseItemDto;
  videoRef: MutableRefObject<VlcPlayerViewRef | null>;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering: boolean;
  showControls: boolean;

  enableTrickplay?: boolean;
  togglePlay: () => void;
  setShowControls: (shown: boolean) => void;
  offline?: boolean;
  isVideoLoaded?: boolean;
  mediaSource?: MediaSourceInfo | null;
  seek: (ticks: number) => void;
  startPictureInPicture?: () => Promise<void>;
  play: () => void;
  pause: () => void;
  getAudioTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  getSubtitleTracks?: (() => Promise<TrackInfo[] | null>) | (() => TrackInfo[]);
  setSubtitleURL?: (url: string, customName: string) => void;
  setSubtitleTrack?: (index: number) => void;
  setAudioTrack?: (index: number) => void;
  setVideoAspectRatio?: (aspectRatio: string | null) => Promise<void>;
  setVideoScaleFactor?: (scaleFactor: number) => Promise<void>;
  aspectRatio?: AspectRatio;
  scaleFactor?: ScaleFactor;
  setAspectRatio?: Dispatch<SetStateAction<AspectRatio>>;
  setScaleFactor?: Dispatch<SetStateAction<ScaleFactor>>;
  isVlc?: boolean;
}

const CONTROLS_TIMEOUT = 4000;

export const Controls: FC<Props> = ({
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
  mediaSource,
  isVideoLoaded,
  getAudioTracks,
  getSubtitleTracks,
  setSubtitleURL,
  setSubtitleTrack,
  setAudioTrack,
  setVideoAspectRatio,
  setVideoScaleFactor,
  aspectRatio = "default",
  scaleFactor = 1.0,
  setAspectRatio,
  setScaleFactor,
  offline = false,
  isVlc = false,
}) => {
  const [settings, updateSettings] = useSettings();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [episodeView, setEpisodeView] = useState(false);
  const [isSliding, setIsSliding] = useState(false);

  // Used when user changes audio through audio button on device.
  const [showAudioSlider, setShowAudioSlider] = useState(false);

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { previousItem, nextItem } = usePlaybackManager({
    item,
    isOffline: offline,
  });

  const {
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
    prefetchAllTrickplayImages,
  } = useTrickplay(item);

  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(Number.POSITIVE_INFINITY);

  const min = useSharedValue(0);
  const max = useSharedValue(item.RunTimeTicks || 0);

  // Animated opacity for smooth transitions
  const controlsOpacity = useSharedValue(showControls ? 1 : 0);

  // Animated scale for slider
  const sliderScale = useSharedValue(1);

  const wasPlayingRef = useRef(false);
  const lastProgressRef = useRef<number>(0);

  const lightHapticFeedback = useHaptic("light");

  // Animate controls opacity when showControls changes
  useEffect(() => {
    controlsOpacity.value = withTiming(showControls ? 1 : 0, {
      duration: 300,
    });
  }, [showControls, controlsOpacity]);

  // Animated styles for controls
  const animatedControlsStyle = useAnimatedStyle(() => {
    return {
      opacity: controlsOpacity.value,
    };
  });

  // Animated style for black overlay (75% opacity when visible)
  const animatedOverlayStyle = useAnimatedStyle(() => {
    return {
      opacity: controlsOpacity.value * 0.75,
    };
  });

  // Animated style for slider scale
  const animatedSliderStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scaleY: sliderScale.value }],
    };
  });

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, []);

  const remoteScrubProgress = useSharedValue<number | null>(null);
  const isRemoteScrubbing = useSharedValue(false);
  const SCRUB_INTERVAL = isVlc ? secondsToMs(10) : msToTicks(secondsToMs(10));
  const [showRemoteBubble, setShowRemoteBubble] = useState(false);

  const [longPressScrubMode, setLongPressScrubMode] = useState<
    "FF" | "RW" | null
  >(null);

  useTVEventHandler((evt) => {
    if (!evt) return;

    switch (evt.eventType) {
      case "longLeft": {
        setLongPressScrubMode((prev) => (!prev ? "RW" : null));
        break;
      }
      case "longRight": {
        setLongPressScrubMode((prev) => (!prev ? "FF" : null));
        break;
      }
      case "left":
      case "right": {
        isRemoteScrubbing.value = true;
        setShowRemoteBubble(true);

        const direction = evt.eventType === "left" ? -1 : 1;
        const base = remoteScrubProgress.value ?? progress.value;
        const updated = Math.max(
          min.value,
          Math.min(max.value, base + direction * SCRUB_INTERVAL),
        );
        remoteScrubProgress.value = updated;
        const progressInTicks = isVlc ? msToTicks(updated) : updated;
        calculateTrickplayUrl(progressInTicks);
        const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
        const hours = Math.floor(progressInSeconds / 3600);
        const minutes = Math.floor((progressInSeconds % 3600) / 60);
        const seconds = progressInSeconds % 60;
        setTime({ hours, minutes, seconds });
        break;
      }
      case "select": {
        if (isRemoteScrubbing.value && remoteScrubProgress.value != null) {
          progress.value = remoteScrubProgress.value;

          const seekTarget = isVlc
            ? Math.max(0, remoteScrubProgress.value)
            : Math.max(0, ticksToSeconds(remoteScrubProgress.value));

          seek(seekTarget);
          if (isPlaying) play();

          isRemoteScrubbing.value = false;
          remoteScrubProgress.value = null;
          setShowRemoteBubble(false);
        } else {
          togglePlay();
        }
        break;
      }
      case "down":
      case "up":
        // cancel scrubbing on other directions
        isRemoteScrubbing.value = false;
        remoteScrubProgress.value = null;
        setShowRemoteBubble(false);
        break;
      default:
        break;
    }

    if (!showControls) toggleControls();
  });

  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    let isActive = true;
    let seekTime = 10;

    const scrubWithLongPress = () => {
      if (!isActive || !longPressScrubMode) return;

      setIsSliding(true);
      const scrubFn =
        longPressScrubMode === "FF" ? handleSeekForward : handleSeekBackward;
      scrubFn(seekTime);
      seekTime *= 1.1;

      longPressTimeoutRef.current = setTimeout(scrubWithLongPress, 300);
    };

    if (longPressScrubMode) {
      isActive = true;
      scrubWithLongPress();
    }

    return () => {
      isActive = false;
      setIsSliding(false);
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    };
  }, [longPressScrubMode]);

  const effectiveProgress = useSharedValue(0);

  // Recompute progress whenever remote scrubbing is active
  useAnimatedReaction(
    () => ({
      isScrubbing: isRemoteScrubbing.value,
      scrub: remoteScrubProgress.value,
      actual: progress.value,
    }),
    (current) => {
      effectiveProgress.value =
        current.isScrubbing && current.scrub != null
          ? current.scrub
          : current.actual;
    },
    [],
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

  const { bitrateValue, subtitleIndex, audioIndex } = useLocalSearchParams<{
    bitrateValue: string;
    audioIndex: string;
    subtitleIndex: string;
  }>();

  const { showSkipButton, skipIntro } = useIntroSkipper(
    item?.Id!,
    currentTime,
    seek,
    play,
    isVlc,
    offline,
  );

  const { showSkipCreditButton, skipCredit } = useCreditSkipper(
    item?.Id!,
    currentTime,
    seek,
    play,
    isVlc,
    offline,
  );

  const goToItemCommon = useCallback(
    (item: BaseItemDto) => {
      if (!item || !settings) {
        return;
      }
      lightHapticFeedback();
      const previousIndexes = {
        subtitleIndex: subtitleIndex
          ? Number.parseInt(subtitleIndex, 10)
          : undefined,
        audioIndex: audioIndex ? Number.parseInt(audioIndex, 10) : undefined,
      };

      const {
        mediaSource: newMediaSource,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
      } = getDefaultPlaySettings(
        item,
        settings,
        previousIndexes,
        mediaSource ?? undefined,
      );

      const queryParams = new URLSearchParams({
        ...(offline && { offline: "true" }),
        itemId: item.Id ?? "",
        audioIndex: defaultAudioIndex?.toString() ?? "",
        subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
        mediaSourceId: newMediaSource?.Id ?? "",
        bitrateValue: bitrateValue?.toString(),
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "",
      }).toString();

      console.log("queryParams", queryParams);

      // @ts-expect-error
      router.replace(`player/direct-player?${queryParams}`);
    },
    [settings, subtitleIndex, audioIndex, mediaSource, bitrateValue, router],
  );

  const goToPreviousItem = useCallback(() => {
    if (!previousItem) {
      return;
    }
    goToItemCommon(previousItem);
  }, [previousItem, goToItemCommon]);

  const goToNextItem = useCallback(
    ({
      isAutoPlay,
      resetWatchCount,
    }: {
      isAutoPlay?: boolean;
      resetWatchCount?: boolean;
    }) => {
      if (!nextItem) {
        return;
      }

      if (!isAutoPlay) {
        // if we are not autoplaying, we won't update anything, we just go to the next item
        goToItemCommon(nextItem);
        if (resetWatchCount) {
          updateSettings({
            autoPlayEpisodeCount: 0,
          });
        }
        return;
      }

      // Skip autoplay logic if maxAutoPlayEpisodeCount is -1
      if (settings.maxAutoPlayEpisodeCount.value === -1) {
        goToItemCommon(nextItem);
        return;
      }

      if (
        settings.autoPlayEpisodeCount + 1 <
        settings.maxAutoPlayEpisodeCount.value
      ) {
        goToItemCommon(nextItem);
      }

      // Check if the autoPlayEpisodeCount is less than maxAutoPlayEpisodeCount for the autoPlay
      if (
        settings.autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value
      ) {
        // update the autoPlayEpisodeCount in settings
        updateSettings({
          autoPlayEpisodeCount: settings.autoPlayEpisodeCount + 1,
        });
      }
    },
    [nextItem, goToItemCommon],
  );

  // Add a memoized handler for autoplay next episode
  const handleNextEpisodeAutoPlay = useCallback(() => {
    goToNextItem({ isAutoPlay: true });
  }, [goToNextItem]);

  // Add a memoized handler for manual next episode
  const handleNextEpisodeManual = useCallback(() => {
    goToNextItem({ isAutoPlay: false });
  }, [goToNextItem]);

  // Add a memoized handler for ContinueWatchingOverlay
  const handleContinueWatching = useCallback(
    (options: { isAutoPlay?: boolean; resetWatchCount?: boolean }) => {
      goToNextItem(options);
    },
    [goToNextItem],
  );

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = isVlc ? currentProgress : ticksToSeconds(currentProgress);
      const remaining = isVlc
        ? maxValue - currentProgress
        : ticksToSeconds(maxValue - currentProgress);

      setCurrentTime(current);
      setRemainingTime(remaining);
    },
    [goToNextItem, isVlc],
  );

  useAnimatedReaction(
    () => ({
      progress: progress.value,
      max: max.value,
      isSeeking: isSeeking.value,
    }),
    (result) => {
      if (!result.isSeeking) {
        runOnJS(updateTimes)(result.progress, result.max);
      }
    },
    [updateTimes],
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
    if (!showControls) {
      return;
    }

    setIsSliding(true);
    wasPlayingRef.current = isPlaying;
    lastProgressRef.current = progress.value;

    pause();
    isSeeking.value = true;
  }, [showControls, isPlaying, pause]);

  const handleTouchStart = useCallback(() => {
    if (!showControls) {
      return;
    }

    // Scale up the slider immediately on touch
    sliderScale.value = withTiming(1.4, { duration: 300 });
  }, [showControls]);

  const handleTouchEnd = useCallback(() => {
    if (!showControls) {
      return;
    }

    // Scale down the slider on touch end (only if not sliding, to avoid conflict with onSlidingComplete)
    if (!isSliding) {
      sliderScale.value = withTiming(1.0, { duration: 300 });
    }
  }, [showControls, isSliding]);

  const handleSliderComplete = useCallback(
    async (value: number) => {
      isSeeking.value = false;
      progress.value = value;
      setIsSliding(false);

      // Scale down the slider
      sliderScale.value = withTiming(1.0, { duration: 200 });

      seek(Math.max(0, Math.floor(isVlc ? value : ticksToSeconds(value))));
      if (wasPlayingRef.current) {
        play();
      }
    },
    [isVlc, seek, play],
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
    [],
  );

  const handleSkipBackward = useCallback(async () => {
    if (!settings?.rewindSkipTime) {
      return;
    }
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? Math.max(0, curr - secondsToMs(settings.rewindSkipTime))
          : Math.max(0, ticksToSeconds(curr) - settings.rewindSkipTime);
        seek(newTime);
        if (wasPlayingRef.current) {
          play();
        }
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying, isVlc, play, seek]);

  const handleSeekBackward = useCallback(
    async (seconds: number) => {
      wasPlayingRef.current = isPlaying;
      try {
        const curr = progress.value;
        if (curr !== undefined) {
          const newTime = isVlc
            ? Math.max(0, curr - secondsToMs(seconds))
            : Math.max(0, ticksToSeconds(curr) - seconds);
          seek(newTime);
        }
      } catch (error) {
        writeToLog("ERROR", "Error seeking video backwards", error);
      }
    },
    [isPlaying, isVlc, seek],
  );

  const handleSeekForward = useCallback(
    async (seconds: number) => {
      wasPlayingRef.current = isPlaying;
      try {
        const curr = progress.value;
        if (curr !== undefined) {
          const newTime = isVlc
            ? curr + secondsToMs(seconds)
            : ticksToSeconds(curr) + seconds;
          seek(Math.max(0, newTime));
        }
      } catch (error) {
        writeToLog("ERROR", "Error seeking video forwards", error);
      }
    },
    [isPlaying, isVlc, seek],
  );

  const handleSkipForward = useCallback(async () => {
    if (!settings?.forwardSkipTime) {
      return;
    }
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? curr + secondsToMs(settings.forwardSkipTime)
          : ticksToSeconds(curr) + settings.forwardSkipTime;
        seek(Math.max(0, newTime));
        if (wasPlayingRef.current) {
          play();
        }
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying, isVlc, play, seek]);

  const handleAspectRatioChange = useCallback(
    async (newRatio: AspectRatio) => {
      if (!setAspectRatio || !setVideoAspectRatio) return;

      setAspectRatio(newRatio);
      const aspectRatioString = newRatio === "default" ? null : newRatio;
      await setVideoAspectRatio(aspectRatioString);
    },
    [setAspectRatio, setVideoAspectRatio],
  );

  const handleScaleFactorChange = useCallback(
    async (newScale: ScaleFactor) => {
      if (!setScaleFactor || !setVideoScaleFactor) return;

      setScaleFactor(newScale);
      await setVideoScaleFactor(newScale);
    },
    [setScaleFactor, setVideoScaleFactor],
  );

  const switchOnEpisodeMode = useCallback(() => {
    setEpisodeView(true);
    if (isPlaying) {
      togglePlay();
    }
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
          className='bg-neutral-800 overflow-hidden'
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
            contentFit='cover'
          />
        </View>
        <Text
          style={{
            marginTop: 30,
            fontSize: 16,
          }}
        >
          {`${time.hours > 0 ? `${time.hours}:` : ""}${time.minutes < 10 ? `0${time.minutes}` : time.minutes}:${
            time.seconds < 10 ? `0${time.seconds}` : time.seconds
          }`}
        </Text>
      </View>
    );
  }, [trickPlayUrl, trickplayInfo, time]);

  const onClose = async () => {
    lightHapticFeedback();
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
          goToItem={goToItemCommon}
        />
      ) : (
        <>
          <VideoTouchOverlay
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            onToggleControls={toggleControls}
            animatedStyle={animatedOverlayStyle}
          />
          <Animated.View
            style={[
              {
                position: "absolute",
                top: settings?.safeAreaInControlsEnabled ? insets.top : 0,
                right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
                width: settings?.safeAreaInControlsEnabled
                  ? screenWidth - insets.left - insets.right
                  : screenWidth,
              },
              animatedControlsStyle,
            ]}
            pointerEvents={showControls ? "auto" : "none"}
            className={"flex flex-row w-full pt-2"}
          >
            <View className='mr-auto'>
              {!Platform.isTV && (!offline || !mediaSource?.TranscodingUrl) && (
                <VideoProvider
                  getAudioTracks={getAudioTracks}
                  getSubtitleTracks={getSubtitleTracks}
                  setAudioTrack={setAudioTrack}
                  setSubtitleTrack={setSubtitleTrack}
                  setSubtitleURL={setSubtitleURL}
                >
                  <DropdownView />
                </VideoProvider>
              )}
            </View>

            <View className='flex flex-row items-center space-x-2 '>
              {!Platform.isTV &&
                (settings.defaultPlayer === VideoPlayer.VLC_4 ||
                  Platform.OS === "android") && (
                  <TouchableOpacity
                    onPress={startPictureInPicture}
                    className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
                  >
                    <MaterialIcons
                      name='picture-in-picture'
                      size={24}
                      color='white'
                      style={{ opacity: showControls ? 1 : 0 }}
                    />
                  </TouchableOpacity>
                )}
              {item?.Type === "Episode" && (
                <TouchableOpacity
                  onPress={() => {
                    switchOnEpisodeMode();
                  }}
                  className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
                >
                  <Ionicons name='list' size={24} color='white' />
                </TouchableOpacity>
              )}
              {previousItem && (
                <TouchableOpacity
                  onPress={goToPreviousItem}
                  className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
                >
                  <Ionicons name='play-skip-back' size={24} color='white' />
                </TouchableOpacity>
              )}
              {nextItem && (
                <TouchableOpacity
                  onPress={() => goToNextItem({ isAutoPlay: false })}
                  className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
                >
                  <Ionicons name='play-skip-forward' size={24} color='white' />
                </TouchableOpacity>
              )}
              {/* Video Controls */}
              <AspectRatioSelector
                currentRatio={aspectRatio}
                onRatioChange={handleAspectRatioChange}
                disabled={!setVideoAspectRatio}
              />
              <ScaleFactorSelector
                currentScale={scaleFactor}
                onScaleChange={handleScaleFactorChange}
                disabled={!setVideoScaleFactor}
              />
              <TouchableOpacity
                onPress={onClose}
                className='aspect-square flex flex-col rounded-xl items-center justify-center p-2'
              >
                <Ionicons name='close' size={24} color='white' />
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View
            style={[
              {
                position: "absolute",
                top: "50%", // Center vertically
                left: settings?.safeAreaInControlsEnabled ? insets.left : 0,
                right: settings?.safeAreaInControlsEnabled ? insets.right : 0,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                transform: [{ translateY: -22.5 }], // Adjust for the button's height (half of 45)
                paddingHorizontal: 17,
              },
              animatedControlsStyle,
            ]}
            pointerEvents={showControls ? "box-none" : "none"}
          >
            {/* Brightness Control */}
            <View
              style={{
                width: 50,
                height: 50,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ rotate: "270deg" }],
              }}
            >
              <BrightnessSlider />
            </View>

            {/* Skip Backward */}
            {!Platform.isTV && (
              <TouchableOpacity onPress={handleSkipBackward}>
                <View
                  style={{
                    position: "relative",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons
                    name='refresh-outline'
                    size={50}
                    color='white'
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
            )}

            {/* Play/Pause Button */}
            <View style={{ alignItems: "center" }}>
              <TouchableOpacity
                onPress={() => {
                  togglePlay();
                }}
              >
                {!isBuffering ? (
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={50}
                    color='white'
                  />
                ) : (
                  <Loader size={"large"} />
                )}
              </TouchableOpacity>
            </View>

            {/* Skip Forward */}
            {!Platform.isTV && (
              <TouchableOpacity onPress={handleSkipForward}>
                <View
                  style={{
                    position: "relative",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name='refresh-outline' size={50} color='white' />
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
            )}

            {/* Volume/Audio Control */}
            <View
              style={{
                width: 50,
                height: 50,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ rotate: "270deg" }],
                opacity: showAudioSlider || showControls ? 1 : 0,
              }}
            >
              <AudioSlider setVisibility={setShowAudioSlider} />
            </View>
          </Animated.View>

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
                  <Text className='text-xs opacity-50'>
                    {item?.ProductionYear}
                  </Text>
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
                  <Animated.View style={animatedSliderStyle}>
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
                        (isSliding || showRemoteBubble) &&
                        memoizedRenderBubble()
                      }
                      sliderHeight={10}
                      thumbWidth={0}
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
                      ends at {(() => {
                        const now = new Date();
                        const remainingMs = isVlc
                          ? remainingTime
                          : remainingTime * 1000;
                        const finishTime = new Date(
                          now.getTime() + remainingMs,
                        );
                        return finishTime.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        });
                      })()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        </>
      )}
      {settings.maxAutoPlayEpisodeCount.value !== -1 && (
        <ContinueWatchingOverlay goToNextItem={handleContinueWatching} />
      )}
    </ControlProvider>
  );
};
