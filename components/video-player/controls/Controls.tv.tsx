import { Ionicons } from "@expo/vector-icons";
import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { BlurView } from "expo-blur";
import { useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Pressable,
  Animated as RNAnimated,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv";
import useRouter from "@/hooks/useAppRouter";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useTrickplay } from "@/hooks/useTrickplay";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { useTVSubtitleModal } from "@/hooks/useTVSubtitleModal";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { formatTimeString, msToTicks, ticksToMs } from "@/utils/time";
import { CONTROLS_CONSTANTS } from "./constants";
import { useRemoteControl } from "./hooks/useRemoteControl";
import { useVideoTime } from "./hooks/useVideoTime";
import { TrickplayBubble } from "./TrickplayBubble";
import { useControlsTimeout } from "./useControlsTimeout";

interface Props {
  item: BaseItemDto;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering?: boolean;
  showControls: boolean;
  togglePlay: () => void;
  setShowControls: (shown: boolean) => void;
  mediaSource?: MediaSourceInfo | null;
  seek: (ticks: number) => void;
  play: () => void;
  pause: () => void;
  audioIndex?: number;
  subtitleIndex?: number;
  onAudioIndexChange?: (index: number) => void;
  onSubtitleIndexChange?: (index: number) => void;
  previousItem?: BaseItemDto | null;
  nextItem?: BaseItemDto | null;
  goToPreviousItem?: () => void;
  goToNextItem?: () => void;
  onServerSubtitleDownloaded?: () => void;
  addSubtitleFile?: (path: string) => void;
}

const TV_SEEKBAR_HEIGHT = 16;
const TV_AUTO_HIDE_TIMEOUT = 5000;

// TV Control Button for player controls (icon only, no label)
const TVControlButton: FC<{
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  size?: number;
  delayLongPress?: number;
}> = ({
  icon,
  onPress,
  onLongPress,
  onPressOut,
  disabled,
  hasTVPreferredFocus,
  size = 32,
  delayLongPress = 300,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.15, duration: 120 });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={delayLongPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      focusable={!disabled}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
    >
      <RNAnimated.View
        style={[
          controlButtonStyles.button,
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255,255,255,0.3)"
              : "rgba(255,255,255,0.1)",
            borderColor: focused
              ? "rgba(255,255,255,0.8)"
              : "rgba(255,255,255,0.2)",
            opacity: disabled ? 0.3 : 1,
          },
        ]}
      >
        <Ionicons name={icon} size={size} color='#fff' />
      </RNAnimated.View>
    </Pressable>
  );
};

const controlButtonStyles = StyleSheet.create({
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
});

// TV Next Episode Countdown component - horizontal layout with animated progress bar
const TVNextEpisodeCountdown: FC<{
  nextItem: BaseItemDto;
  api: Api | null;
  show: boolean;
  isPlaying: boolean;
  onFinish: () => void;
}> = ({ nextItem, api, show, isPlaying, onFinish }) => {
  const { t } = useTranslation();
  const progress = useSharedValue(0);
  const onFinishRef = useRef(onFinish);

  onFinishRef.current = onFinish;

  const imageUrl = getPrimaryImageUrl({
    api,
    item: nextItem,
    width: 360,
    quality: 80,
  });

  useEffect(() => {
    if (show && isPlaying) {
      progress.value = 0;
      progress.value = withTiming(
        1,
        {
          duration: 8000,
          easing: Easing.linear,
        },
        (finished) => {
          if (finished && onFinishRef.current) {
            runOnJS(onFinishRef.current)();
          }
        },
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
  }, [show, isPlaying, progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  if (!show) return null;

  return (
    <View style={countdownStyles.container} pointerEvents='none'>
      <BlurView intensity={80} tint='dark' style={countdownStyles.blur}>
        <View style={countdownStyles.innerContainer}>
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={countdownStyles.thumbnail}
              resizeMode='cover'
            />
          )}

          <View style={countdownStyles.content}>
            <Text style={countdownStyles.label}>
              {t("player.next_episode")}
            </Text>

            <Text style={countdownStyles.seriesName} numberOfLines={1}>
              {nextItem.SeriesName}
            </Text>

            <Text style={countdownStyles.episodeInfo} numberOfLines={1}>
              S{nextItem.ParentIndexNumber}E{nextItem.IndexNumber} -{" "}
              {nextItem.Name}
            </Text>

            <View style={countdownStyles.progressContainer}>
              <Animated.View
                style={[countdownStyles.progressBar, progressStyle]}
              />
            </View>
          </View>
        </View>
      </BlurView>
    </View>
  );
};

const countdownStyles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 180,
    right: 80,
    zIndex: 100,
  },
  blur: {
    borderRadius: 16,
    overflow: "hidden",
  },
  innerContainer: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  thumbnail: {
    width: 180,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  content: {
    padding: 16,
    justifyContent: "center",
    width: 280,
  },
  label: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  seriesName: {
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 2,
  },
  episodeInfo: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "600",
    marginBottom: 12,
  },
  progressContainer: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
});

export const Controls: FC<Props> = ({
  item,
  seek,
  play: _play,
  pause: _pause,
  togglePlay,
  isPlaying,
  isSeeking,
  progress,
  cacheProgress,
  showControls,
  setShowControls,
  mediaSource,
  audioIndex,
  subtitleIndex,
  onAudioIndexChange,
  onSubtitleIndexChange,
  previousItem,
  nextItem: nextItemProp,
  goToPreviousItem,
  goToNextItem: goToNextItemProp,
  onServerSubtitleDownloaded,
  addSubtitleFile,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const router = useRouter();
  const {
    bitrateValue,
    subtitleIndex: paramSubtitleIndex,
    audioIndex: paramAudioIndex,
  } = useLocalSearchParams<{
    bitrateValue: string;
    subtitleIndex: string;
    audioIndex: string;
  }>();

  const { nextItem: internalNextItem } = usePlaybackManager({
    item,
    isOffline: false,
  });

  const nextItem = nextItemProp ?? internalNextItem;

  // TV Option Modal hook for audio selector
  const { showOptions } = useTVOptionModal();

  // TV Subtitle Modal hook
  const { showSubtitleModal } = useTVSubtitleModal();

  // Track which button should have preferred focus when controls show
  type LastModalType = "audio" | "subtitle" | null;
  const [lastOpenedModal, setLastOpenedModal] = useState<LastModalType>(null);

  const audioTracks = useMemo(() => {
    return mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") ?? [];
  }, [mediaSource]);

  const subtitleTracks = useMemo(() => {
    return (
      mediaSource?.MediaStreams?.filter((s) => s.Type === "Subtitle") ?? []
    );
  }, [mediaSource]);

  const audioOptions: TVOptionItem<number>[] = useMemo(() => {
    return audioTracks.map((track) => ({
      label:
        track.DisplayTitle || `${track.Language || "Unknown"} (${track.Codec})`,
      value: track.Index!,
      selected: track.Index === audioIndex,
    }));
  }, [audioTracks, audioIndex]);

  const handleAudioChange = useCallback(
    (index: number) => {
      onAudioIndexChange?.(index);
    },
    [onAudioIndexChange],
  );

  const handleSubtitleChange = useCallback(
    (index: number) => {
      onSubtitleIndexChange?.(index);
    },
    [onSubtitleIndexChange],
  );

  const {
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
    prefetchAllTrickplayImages,
  } = useTrickplay(item);

  const min = useSharedValue(0);
  const maxMs = ticksToMs(item.RunTimeTicks || 0);
  const max = useSharedValue(maxMs);

  const controlsOpacity = useSharedValue(showControls ? 1 : 0);
  const bottomTranslateY = useSharedValue(showControls ? 0 : 50);

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, [prefetchAllTrickplayImages]);

  useEffect(() => {
    const animationConfig = {
      duration: 300,
      easing: Easing.out(Easing.quad),
    };

    controlsOpacity.value = withTiming(showControls ? 1 : 0, animationConfig);
    bottomTranslateY.value = withTiming(showControls ? 0 : 30, animationConfig);
  }, [showControls, controlsOpacity, bottomTranslateY]);

  const bottomAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: bottomTranslateY.value }],
  }));

  useEffect(() => {
    if (item) {
      progress.value = ticksToMs(item?.UserData?.PlaybackPositionTicks);
      max.value = ticksToMs(item.RunTimeTicks || 0);
    }
  }, [item, progress, max]);

  const { currentTime, remainingTime } = useVideoTime({
    progress,
    max,
    isSeeking,
  });

  const getFinishTime = () => {
    const now = new Date();
    const finishTime = new Date(now.getTime() + remainingTime);
    return finishTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const toggleControls = useCallback(() => {
    setShowControls(!showControls);
  }, [showControls, setShowControls]);

  const [showSeekBubble, setShowSeekBubble] = useState(false);
  const [seekBubbleTime, setSeekBubbleTime] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const seekBubbleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const continuousSeekRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seekAccelerationRef = useRef(1);
  const controlsInteractionRef = useRef<() => void>(() => {});
  const goToNextItemRef = useRef<(opts?: { isAutoPlay?: boolean }) => void>(
    () => {},
  );

  const updateSeekBubbleTime = useCallback((ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    setSeekBubbleTime({ hours, minutes, seconds });
  }, []);

  const handleBack = useCallback(() => {
    // No longer needed since modals are screen-based
  }, []);

  const { isSliding: isRemoteSliding } = useRemoteControl({
    showControls,
    toggleControls,
    togglePlay,
    onBack: handleBack,
  });

  const handleOpenAudioSheet = useCallback(() => {
    setLastOpenedModal("audio");
    showOptions({
      title: t("item_card.audio"),
      options: audioOptions,
      onSelect: handleAudioChange,
    });
    controlsInteractionRef.current();
  }, [showOptions, t, audioOptions, handleAudioChange]);

  const handleServerSubtitleDownloaded = useCallback(() => {
    onServerSubtitleDownloaded?.();
  }, [onServerSubtitleDownloaded]);

  const handleLocalSubtitleDownloaded = useCallback(
    (path: string) => {
      addSubtitleFile?.(path);
    },
    [addSubtitleFile],
  );

  const handleOpenSubtitleSheet = useCallback(() => {
    setLastOpenedModal("subtitle");
    showSubtitleModal({
      item,
      mediaSourceId: mediaSource?.Id,
      subtitleTracks,
      currentSubtitleIndex: subtitleIndex ?? -1,
      onSubtitleIndexChange: handleSubtitleChange,
      onServerSubtitleDownloaded: handleServerSubtitleDownloaded,
      onLocalSubtitleDownloaded: handleLocalSubtitleDownloaded,
    });
    controlsInteractionRef.current();
  }, [
    showSubtitleModal,
    item,
    mediaSource?.Id,
    subtitleTracks,
    subtitleIndex,
    handleSubtitleChange,
    handleServerSubtitleDownloaded,
    handleLocalSubtitleDownloaded,
  ]);

  const effectiveProgress = useSharedValue(0);

  const SEEK_THRESHOLD_MS = 5000;

  useAnimatedReaction(
    () => progress.value,
    (current, _previous) => {
      const progressUnit = CONTROLS_CONSTANTS.PROGRESS_UNIT_MS;
      const progressDiff = Math.abs(current - effectiveProgress.value);
      if (progressDiff >= progressUnit) {
        if (progressDiff >= SEEK_THRESHOLD_MS) {
          effectiveProgress.value = withTiming(current, {
            duration: 200,
            easing: Easing.out(Easing.quad),
          });
        } else {
          effectiveProgress.value = current;
        }
      }
    },
    [],
  );

  const hideControls = useCallback(() => {
    setShowControls(false);
  }, [setShowControls]);

  const { handleControlsInteraction } = useControlsTimeout({
    showControls,
    isSliding: isRemoteSliding,
    episodeView: false,
    onHideControls: hideControls,
    timeout: TV_AUTO_HIDE_TIMEOUT,
    disabled: false,
  });

  controlsInteractionRef.current = handleControlsInteraction;

  const handleSeekForwardButton = useCallback(() => {
    const newPosition = Math.min(max.value, progress.value + 30 * 1000);
    progress.value = newPosition;
    seek(newPosition);

    calculateTrickplayUrl(msToTicks(newPosition));
    updateSeekBubbleTime(newPosition);
    setShowSeekBubble(true);

    if (seekBubbleTimeoutRef.current) {
      clearTimeout(seekBubbleTimeoutRef.current);
    }
    seekBubbleTimeoutRef.current = setTimeout(() => {
      setShowSeekBubble(false);
    }, 2000);

    controlsInteractionRef.current();
  }, [progress, max, seek, calculateTrickplayUrl, updateSeekBubbleTime]);

  const handleSeekBackwardButton = useCallback(() => {
    const newPosition = Math.max(min.value, progress.value - 30 * 1000);
    progress.value = newPosition;
    seek(newPosition);

    calculateTrickplayUrl(msToTicks(newPosition));
    updateSeekBubbleTime(newPosition);
    setShowSeekBubble(true);

    if (seekBubbleTimeoutRef.current) {
      clearTimeout(seekBubbleTimeoutRef.current);
    }
    seekBubbleTimeoutRef.current = setTimeout(() => {
      setShowSeekBubble(false);
    }, 2000);

    controlsInteractionRef.current();
  }, [progress, min, seek, calculateTrickplayUrl, updateSeekBubbleTime]);

  const stopContinuousSeeking = useCallback(() => {
    if (continuousSeekRef.current) {
      clearInterval(continuousSeekRef.current);
      continuousSeekRef.current = null;
    }
    seekAccelerationRef.current = 1;

    if (seekBubbleTimeoutRef.current) {
      clearTimeout(seekBubbleTimeoutRef.current);
    }
    seekBubbleTimeoutRef.current = setTimeout(() => {
      setShowSeekBubble(false);
    }, 2000);
  }, []);

  const startContinuousSeekForward = useCallback(() => {
    seekAccelerationRef.current = 1;

    handleSeekForwardButton();

    continuousSeekRef.current = setInterval(() => {
      const seekAmount =
        CONTROLS_CONSTANTS.LONG_PRESS_INITIAL_SEEK *
        seekAccelerationRef.current *
        1000;
      const newPosition = Math.min(max.value, progress.value + seekAmount);
      progress.value = newPosition;
      seek(newPosition);

      calculateTrickplayUrl(msToTicks(newPosition));
      updateSeekBubbleTime(newPosition);

      seekAccelerationRef.current *= CONTROLS_CONSTANTS.LONG_PRESS_ACCELERATION;

      controlsInteractionRef.current();
    }, CONTROLS_CONSTANTS.LONG_PRESS_INTERVAL);
  }, [
    handleSeekForwardButton,
    max,
    progress,
    seek,
    calculateTrickplayUrl,
    updateSeekBubbleTime,
  ]);

  const startContinuousSeekBackward = useCallback(() => {
    seekAccelerationRef.current = 1;

    handleSeekBackwardButton();

    continuousSeekRef.current = setInterval(() => {
      const seekAmount =
        CONTROLS_CONSTANTS.LONG_PRESS_INITIAL_SEEK *
        seekAccelerationRef.current *
        1000;
      const newPosition = Math.max(min.value, progress.value - seekAmount);
      progress.value = newPosition;
      seek(newPosition);

      calculateTrickplayUrl(msToTicks(newPosition));
      updateSeekBubbleTime(newPosition);

      seekAccelerationRef.current *= CONTROLS_CONSTANTS.LONG_PRESS_ACCELERATION;

      controlsInteractionRef.current();
    }, CONTROLS_CONSTANTS.LONG_PRESS_INTERVAL);
  }, [
    handleSeekBackwardButton,
    min,
    progress,
    seek,
    calculateTrickplayUrl,
    updateSeekBubbleTime,
  ]);

  const handlePlayPauseButton = useCallback(() => {
    togglePlay();
    controlsInteractionRef.current();
  }, [togglePlay]);

  const handlePreviousItem = useCallback(() => {
    if (goToPreviousItem) {
      goToPreviousItem();
    }
    controlsInteractionRef.current();
  }, [goToPreviousItem]);

  const handleNextItemButton = useCallback(() => {
    if (goToNextItemProp) {
      goToNextItemProp();
    } else {
      goToNextItemRef.current({ isAutoPlay: false });
    }
    controlsInteractionRef.current();
  }, [goToNextItemProp]);

  const goToNextItem = useCallback(
    ({ isAutoPlay: _isAutoPlay }: { isAutoPlay?: boolean } = {}) => {
      if (!nextItem || !settings) {
        return;
      }

      const previousIndexes = {
        subtitleIndex: paramSubtitleIndex
          ? Number.parseInt(paramSubtitleIndex, 10)
          : undefined,
        audioIndex: paramAudioIndex
          ? Number.parseInt(paramAudioIndex, 10)
          : undefined,
      };

      const {
        mediaSource: newMediaSource,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
      } = getDefaultPlaySettings(nextItem, settings, {
        indexes: previousIndexes,
        source: mediaSource ?? undefined,
      });

      const queryParams = new URLSearchParams({
        itemId: nextItem.Id ?? "",
        audioIndex: defaultAudioIndex?.toString() ?? "",
        subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
        mediaSourceId: newMediaSource?.Id ?? "",
        bitrateValue: bitrateValue?.toString() ?? "",
        playbackPosition:
          nextItem.UserData?.PlaybackPositionTicks?.toString() ?? "",
      }).toString();

      router.replace(`player/direct-player?${queryParams}` as any);
    },
    [
      nextItem,
      settings,
      paramSubtitleIndex,
      paramAudioIndex,
      mediaSource,
      bitrateValue,
      router,
    ],
  );

  goToNextItemRef.current = goToNextItem;

  const shouldShowCountdown = useMemo(() => {
    if (!nextItem) return false;
    if (item?.Type !== "Episode") return false;
    return remainingTime > 0 && remainingTime <= 10000;
  }, [nextItem, item, remainingTime]);

  const handleAutoPlayFinish = useCallback(() => {
    goToNextItem({ isAutoPlay: true });
  }, [goToNextItem]);

  return (
    <View style={styles.controlsContainer} pointerEvents='box-none'>
      <Animated.View
        style={[styles.darkOverlay, bottomAnimatedStyle]}
        pointerEvents='none'
      />

      {nextItem && (
        <TVNextEpisodeCountdown
          nextItem={nextItem}
          api={api}
          show={shouldShowCountdown}
          isPlaying={isPlaying}
          onFinish={handleAutoPlayFinish}
        />
      )}

      <Animated.View
        style={[styles.bottomContainer, bottomAnimatedStyle]}
        pointerEvents={showControls && !false ? "auto" : "none"}
      >
        <View
          style={[
            styles.bottomInner,
            {
              paddingRight: Math.max(insets.right, 48),
              paddingLeft: Math.max(insets.left, 48),
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
          onTouchStart={handleControlsInteraction}
        >
          <View style={styles.metadataContainer}>
            {item?.Type === "Episode" && (
              <Text
                style={styles.subtitleText}
              >{`${item.SeriesName} - ${item.SeasonName} Episode ${item.IndexNumber}`}</Text>
            )}
            <Text style={styles.titleText}>{item?.Name}</Text>
            {item?.Type === "Movie" && (
              <Text style={styles.subtitleText}>{item?.ProductionYear}</Text>
            )}
          </View>

          <View style={styles.controlButtonsRow}>
            <TVControlButton
              icon='play-skip-back'
              onPress={handlePreviousItem}
              disabled={false || !previousItem}
              size={28}
            />
            <TVControlButton
              icon='play-back'
              onPress={handleSeekBackwardButton}
              onLongPress={startContinuousSeekBackward}
              onPressOut={stopContinuousSeeking}
              disabled={false}
              size={28}
            />
            <TVControlButton
              icon={isPlaying ? "pause" : "play"}
              onPress={handlePlayPauseButton}
              disabled={false}
              hasTVPreferredFocus={!false && lastOpenedModal === null}
              size={36}
            />
            <TVControlButton
              icon='play-forward'
              onPress={handleSeekForwardButton}
              onLongPress={startContinuousSeekForward}
              onPressOut={stopContinuousSeeking}
              disabled={false}
              size={28}
            />
            <TVControlButton
              icon='play-skip-forward'
              onPress={handleNextItemButton}
              disabled={false || !nextItem}
              size={28}
            />

            <View style={styles.controlButtonsSpacer} />

            {audioOptions.length > 0 && (
              <TVControlButton
                icon='volume-high'
                onPress={handleOpenAudioSheet}
                disabled={false}
                hasTVPreferredFocus={!false && lastOpenedModal === "audio"}
                size={24}
              />
            )}

            <TVControlButton
              icon='text'
              onPress={handleOpenSubtitleSheet}
              disabled={false}
              hasTVPreferredFocus={!false && lastOpenedModal === "subtitle"}
              size={24}
            />
          </View>

          {showSeekBubble && (
            <View style={styles.trickplayBubbleContainer}>
              <TrickplayBubble
                trickPlayUrl={trickPlayUrl}
                trickplayInfo={trickplayInfo}
                time={seekBubbleTime}
              />
            </View>
          )}

          <View style={styles.progressBarContainer} pointerEvents='none'>
            <View style={styles.progressTrack}>
              <Animated.View
                style={[
                  styles.cacheProgress,
                  useAnimatedStyle(() => ({
                    width: `${max.value > 0 ? (cacheProgress.value / max.value) * 100 : 0}%`,
                  })),
                ]}
              />
              <Animated.View
                style={[
                  styles.progressFill,
                  useAnimatedStyle(() => ({
                    width: `${max.value > 0 ? (effectiveProgress.value / max.value) * 100 : 0}%`,
                  })),
                ]}
              />
            </View>
          </View>

          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>
              {formatTimeString(currentTime, "ms")}
            </Text>
            <View style={styles.timeRight}>
              <Text style={styles.timeText}>
                -{formatTimeString(remainingTime, "ms")}
              </Text>
              <Text style={styles.endsAtText}>
                {t("player.ends_at")} {getFinishTime()}
              </Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  controlsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  darkOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomInner: {
    flexDirection: "column",
  },
  metadataContainer: {
    marginBottom: 16,
  },
  subtitleText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 18,
  },
  titleText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
  },
  controlButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
    paddingVertical: 8,
  },
  controlButtonsSpacer: {
    flex: 1,
  },
  trickplayBubbleContainer: {
    position: "absolute",
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  progressBarContainer: {
    height: TV_SEEKBAR_HEIGHT,
    justifyContent: "center",
    marginBottom: 8,
  },
  progressTrack: {
    height: TV_SEEKBAR_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    overflow: "hidden",
  },
  cacheProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 8,
  },
  progressFill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  timeText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 22,
  },
  timeRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  endsAtText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 16,
    marginTop: 2,
  },
});
