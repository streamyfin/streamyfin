import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
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
  StyleSheet,
  TVFocusGuideView,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { TVControlButton, TVNextEpisodeCountdown } from "@/components/tv";
import { TVFocusableProgressBar } from "@/components/tv/TVFocusableProgressBar";
import { TVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useTrickplay } from "@/hooks/useTrickplay";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { useTVSubtitleModal } from "@/hooks/useTVSubtitleModal";
import type { TechnicalInfo } from "@/modules/mpv-player";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { formatTimeString, msToTicks, ticksToMs } from "@/utils/time";
import { CONTROLS_CONSTANTS } from "./constants";
import { useVideoContext } from "./contexts/VideoContext";
import { useRemoteControl } from "./hooks/useRemoteControl";
import { useVideoTime } from "./hooks/useVideoTime";
import { TechnicalInfoOverlay } from "./TechnicalInfoOverlay";
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
  onRefreshSubtitleTracks?: () => Promise<
    import("@jellyfin/sdk/lib/generated-client").MediaStream[]
  >;
  addSubtitleFile?: (path: string) => void;
  showTechnicalInfo?: boolean;
  onToggleTechnicalInfo?: () => void;
  getTechnicalInfo?: () => Promise<TechnicalInfo>;
  playMethod?: "DirectPlay" | "DirectStream" | "Transcode";
  transcodeReasons?: string[];
}

const TV_SEEKBAR_HEIGHT = 14;
const TV_AUTO_HIDE_TIMEOUT = 5000;

// Trickplay bubble positioning constants
const TV_TRICKPLAY_SCALE = 2;
const TV_TRICKPLAY_BUBBLE_BASE_WIDTH = CONTROLS_CONSTANTS.TILE_WIDTH * 1.5;
const TV_TRICKPLAY_BUBBLE_WIDTH =
  TV_TRICKPLAY_BUBBLE_BASE_WIDTH * TV_TRICKPLAY_SCALE;
const TV_TRICKPLAY_INTERNAL_OFFSET = 62 * TV_TRICKPLAY_SCALE;
const TV_TRICKPLAY_CENTERING_OFFSET = 98 * TV_TRICKPLAY_SCALE;
const TV_TRICKPLAY_RIGHT_PADDING = 150;
const TV_TRICKPLAY_FADE_DURATION = 200;

interface TVTrickplayBubbleProps {
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
  progress: SharedValue<number>;
  max: SharedValue<number>;
  progressBarWidth: number;
  visible: boolean;
}

const TVTrickplayBubblePositioned: FC<TVTrickplayBubbleProps> = ({
  trickPlayUrl,
  trickplayInfo,
  time,
  progress,
  max,
  progressBarWidth,
  visible,
}) => {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, {
      duration: TV_TRICKPLAY_FADE_DURATION,
      easing: Easing.out(Easing.quad),
    });
  }, [visible, opacity]);

  const minX = TV_TRICKPLAY_INTERNAL_OFFSET;
  const maxX =
    progressBarWidth -
    TV_TRICKPLAY_BUBBLE_WIDTH +
    TV_TRICKPLAY_INTERNAL_OFFSET +
    TV_TRICKPLAY_RIGHT_PADDING;

  const animatedStyle = useAnimatedStyle(() => {
    const progressPercent = max.value > 0 ? progress.value / max.value : 0;

    const xPosition = Math.max(
      minX,
      Math.min(
        maxX,
        progressPercent * progressBarWidth -
          TV_TRICKPLAY_BUBBLE_WIDTH / 2 +
          TV_TRICKPLAY_CENTERING_OFFSET,
      ),
    );

    return {
      transform: [{ translateX: xPosition }],
      opacity: opacity.value,
    };
  });

  return (
    <Animated.View style={[styles.trickplayBubblePositioned, animatedStyle]}>
      <TrickplayBubble
        trickPlayUrl={trickPlayUrl}
        trickplayInfo={trickplayInfo}
        time={time}
        imageScale={TV_TRICKPLAY_SCALE}
      />
    </Animated.View>
  );
};

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
  onRefreshSubtitleTracks,
  addSubtitleFile,
  showTechnicalInfo,
  onToggleTechnicalInfo,
  getTechnicalInfo,
  playMethod,
  transcodeReasons,
}) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { t } = useTranslation();

  // Calculate progress bar width (matches the padding used in bottomInner)
  const progressBarWidth = useMemo(() => {
    const leftPadding = Math.max(insets.left, 48);
    const rightPadding = Math.max(insets.right, 48);
    return screenWidth - leftPadding - rightPadding;
  }, [screenWidth, insets.left, insets.right]);
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

  // Get subtitle tracks from VideoContext (with proper MPV index mapping)
  const { subtitleTracks: videoContextSubtitleTracks } = useVideoContext();

  // Track which button should have preferred focus when controls show
  type LastModalType = "audio" | "subtitle" | "techInfo" | null;
  const [lastOpenedModal, setLastOpenedModal] = useState<LastModalType>(null);

  // Track if play button should have focus (when showing controls via up/down D-pad)
  const [focusPlayButton, setFocusPlayButton] = useState(false);

  // State for progress bar focus and focus guide refs
  const [isProgressBarFocused, setIsProgressBarFocused] = useState(false);
  const [playButtonRef, setPlayButtonRef] = useState<View | null>(null);
  const [progressBarRef, setProgressBarRef] = useState<View | null>(null);

  // Minimal seek bar state (shows only progress bar when seeking while controls hidden)
  const [showMinimalSeekBar, setShowMinimalSeekBar] = useState(false);
  const minimalSeekBarOpacity = useSharedValue(0);
  const minimalSeekBarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const audioTracks = useMemo(() => {
    return mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") ?? [];
  }, [mediaSource]);

  const _subtitleTracks = useMemo(() => {
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

  const _handleSubtitleChange = useCallback(
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

    // Hide minimal seek bar immediately when normal controls show
    if (showControls) {
      setShowMinimalSeekBar(false);
      if (minimalSeekBarTimeoutRef.current) {
        clearTimeout(minimalSeekBarTimeoutRef.current);
        minimalSeekBarTimeoutRef.current = null;
      }
    }
  }, [showControls, controlsOpacity, bottomTranslateY]);

  // Overlay only fades, no slide
  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  // Bottom controls fade and slide up
  const bottomAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: bottomTranslateY.value }],
  }));

  // Minimal seek bar animation
  useEffect(() => {
    const animationConfig = {
      duration: 200,
      easing: Easing.out(Easing.quad),
    };
    minimalSeekBarOpacity.value = withTiming(
      showMinimalSeekBar ? 1 : 0,
      animationConfig,
    );
  }, [showMinimalSeekBar, minimalSeekBarOpacity]);

  const minimalSeekBarAnimatedStyle = useAnimatedStyle(() => ({
    opacity: minimalSeekBarOpacity.value,
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

  // Show minimal seek bar (only progress bar, no buttons)
  const showMinimalSeek = useCallback(() => {
    setShowMinimalSeekBar(true);

    // Clear existing timeout
    if (minimalSeekBarTimeoutRef.current) {
      clearTimeout(minimalSeekBarTimeoutRef.current);
    }

    // Auto-hide after timeout
    minimalSeekBarTimeoutRef.current = setTimeout(() => {
      setShowMinimalSeekBar(false);
    }, 2500);
  }, []);

  // Show minimal seek bar without auto-hide (for continuous seeking)
  const showMinimalSeekPersistent = useCallback(() => {
    setShowMinimalSeekBar(true);

    // Clear existing timeout - don't set a new one
    if (minimalSeekBarTimeoutRef.current) {
      clearTimeout(minimalSeekBarTimeoutRef.current);
      minimalSeekBarTimeoutRef.current = null;
    }
  }, []);

  // Start the minimal seek bar hide timeout
  const startMinimalSeekHideTimeout = useCallback(() => {
    if (minimalSeekBarTimeoutRef.current) {
      clearTimeout(minimalSeekBarTimeoutRef.current);
    }
    minimalSeekBarTimeoutRef.current = setTimeout(() => {
      setShowMinimalSeekBar(false);
    }, 2500);
  }, []);

  // Reset minimal seek bar timeout (call on each seek action)
  const _resetMinimalSeekTimeout = useCallback(() => {
    if (minimalSeekBarTimeoutRef.current) {
      clearTimeout(minimalSeekBarTimeoutRef.current);
    }
    minimalSeekBarTimeoutRef.current = setTimeout(() => {
      setShowMinimalSeekBar(false);
    }, 2500);
  }, []);

  const handleOpenAudioSheet = useCallback(() => {
    setLastOpenedModal("audio");
    showOptions({
      title: t("item_card.audio"),
      options: audioOptions,
      onSelect: handleAudioChange,
    });
    controlsInteractionRef.current();
  }, [showOptions, t, audioOptions, handleAudioChange]);

  const handleLocalSubtitleDownloaded = useCallback(
    (path: string) => {
      addSubtitleFile?.(path);
    },
    [addSubtitleFile],
  );

  const handleOpenSubtitleSheet = useCallback(() => {
    setLastOpenedModal("subtitle");
    // Filter out the "Disable" option from VideoContext tracks since the modal adds its own "None" option
    const tracksWithoutDisable = (videoContextSubtitleTracks ?? []).filter(
      (track) => track.index !== -1,
    );
    showSubtitleModal({
      item,
      mediaSourceId: mediaSource?.Id,
      subtitleTracks: tracksWithoutDisable,
      currentSubtitleIndex: subtitleIndex ?? -1,
      onDisableSubtitles: () => {
        // Find and call the "Disable" track's setTrack from VideoContext
        const disableTrack = videoContextSubtitleTracks?.find(
          (t) => t.index === -1,
        );
        disableTrack?.setTrack();
      },
      onLocalSubtitleDownloaded: handleLocalSubtitleDownloaded,
    });
    controlsInteractionRef.current();
  }, [
    showSubtitleModal,
    item,
    mediaSource?.Id,
    videoContextSubtitleTracks,
    subtitleIndex,
    handleLocalSubtitleDownloaded,
  ]);

  const handleToggleTechnicalInfo = useCallback(() => {
    setLastOpenedModal("techInfo");
    onToggleTechnicalInfo?.();
    controlsInteractionRef.current();
  }, [onToggleTechnicalInfo]);

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

  // Progress bar D-pad seeking (10s increments for finer control)
  const handleProgressSeekRight = useCallback(() => {
    const newPosition = Math.min(max.value, progress.value + 10 * 1000);
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

  const handleProgressSeekLeft = useCallback(() => {
    const newPosition = Math.max(min.value, progress.value - 10 * 1000);
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

  // Minimal seek mode handlers (only show progress bar, not full controls)
  const handleMinimalSeekRight = useCallback(() => {
    const newPosition = Math.min(max.value, progress.value + 10 * 1000);
    progress.value = newPosition;
    seek(newPosition);

    calculateTrickplayUrl(msToTicks(newPosition));
    updateSeekBubbleTime(newPosition);
    setShowSeekBubble(true);

    // Show minimal seek bar and reset its timeout
    showMinimalSeek();

    if (seekBubbleTimeoutRef.current) {
      clearTimeout(seekBubbleTimeoutRef.current);
    }
    seekBubbleTimeoutRef.current = setTimeout(() => {
      setShowSeekBubble(false);
    }, 2000);
  }, [
    progress,
    max,
    seek,
    calculateTrickplayUrl,
    updateSeekBubbleTime,
    showMinimalSeek,
  ]);

  const handleMinimalSeekLeft = useCallback(() => {
    const newPosition = Math.max(min.value, progress.value - 10 * 1000);
    progress.value = newPosition;
    seek(newPosition);

    calculateTrickplayUrl(msToTicks(newPosition));
    updateSeekBubbleTime(newPosition);
    setShowSeekBubble(true);

    // Show minimal seek bar and reset its timeout
    showMinimalSeek();

    if (seekBubbleTimeoutRef.current) {
      clearTimeout(seekBubbleTimeoutRef.current);
    }
    seekBubbleTimeoutRef.current = setTimeout(() => {
      setShowSeekBubble(false);
    }, 2000);
  }, [
    progress,
    min,
    seek,
    calculateTrickplayUrl,
    updateSeekBubbleTime,
    showMinimalSeek,
  ]);

  // Continuous seeking functions (for button long-press and D-pad long-press)
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

    // Start minimal seekbar hide timeout (if it's showing)
    startMinimalSeekHideTimeout();
  }, [startMinimalSeekHideTimeout]);

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

  // D-pad long press handlers - show minimal seekbar when controls are hidden
  const handleDpadLongSeekForward = useCallback(() => {
    if (!showControls) {
      showMinimalSeekPersistent();
    }
    startContinuousSeekForward();
  }, [showControls, showMinimalSeekPersistent, startContinuousSeekForward]);

  const handleDpadLongSeekBackward = useCallback(() => {
    if (!showControls) {
      showMinimalSeekPersistent();
    }
    startContinuousSeekBackward();
  }, [showControls, showMinimalSeekPersistent, startContinuousSeekBackward]);

  // Callback for remote interactions to reset timeout
  const handleRemoteInteraction = useCallback(() => {
    controlsInteractionRef.current();
  }, []);

  // Callback for up/down D-pad - show controls with play button focused
  const handleVerticalDpad = useCallback(() => {
    setFocusPlayButton(true);
    setShowControls(true);
  }, [setShowControls]);

  const { isSliding: isRemoteSliding } = useRemoteControl({
    showControls,
    toggleControls,
    togglePlay,
    onBack: handleBack,
    isProgressBarFocused,
    onSeekLeft: handleProgressSeekLeft,
    onSeekRight: handleProgressSeekRight,
    onMinimalSeekLeft: handleMinimalSeekLeft,
    onMinimalSeekRight: handleMinimalSeekRight,
    onInteraction: handleRemoteInteraction,
    onLongSeekLeftStart: handleDpadLongSeekBackward,
    onLongSeekRightStart: handleDpadLongSeekForward,
    onLongSeekStop: stopContinuousSeeking,
    onVerticalDpad: handleVerticalDpad,
  });

  const hideControls = useCallback(() => {
    setShowControls(false);
    setFocusPlayButton(false);
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
        style={[styles.darkOverlay, overlayAnimatedStyle]}
        pointerEvents='none'
      />

      {getTechnicalInfo && (
        <TechnicalInfoOverlay
          showControls={showControls}
          visible={showTechnicalInfo ?? false}
          getTechnicalInfo={getTechnicalInfo}
          playMethod={playMethod}
          transcodeReasons={transcodeReasons}
          mediaSource={mediaSource}
          currentAudioIndex={audioIndex}
          currentSubtitleIndex={subtitleIndex}
        />
      )}

      {nextItem && (
        <TVNextEpisodeCountdown
          nextItem={nextItem}
          api={api}
          show={shouldShowCountdown}
          isPlaying={isPlaying}
          onFinish={handleAutoPlayFinish}
        />
      )}

      {/* Minimal seek bar - shows only progress bar when seeking while controls hidden */}
      {/* Uses exact same layout as normal controls for alignment */}
      <Animated.View
        style={[styles.minimalSeekBarContainer, minimalSeekBarAnimatedStyle]}
        pointerEvents={showMinimalSeekBar && !showControls ? "auto" : "none"}
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
        >
          <View style={styles.trickplayBubbleContainer}>
            <TVTrickplayBubblePositioned
              trickPlayUrl={trickPlayUrl}
              trickplayInfo={trickplayInfo}
              time={seekBubbleTime}
              progress={effectiveProgress}
              max={max}
              progressBarWidth={progressBarWidth}
              visible={showSeekBubble}
            />
          </View>

          {/* Same padding as TVFocusableProgressBar for alignment */}
          <View style={styles.minimalProgressWrapper}>
            <View
              style={[styles.progressBarContainer, styles.minimalProgressGlow]}
            >
              <View style={[styles.progressTrack, styles.minimalProgressTrack]}>
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
              icon={isPlaying ? "pause" : "play"}
              onPress={handlePlayPauseButton}
              disabled={false}
              size={36}
              refSetter={setPlayButtonRef}
              hasTVPreferredFocus={focusPlayButton && lastOpenedModal === null}
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

            {getTechnicalInfo && (
              <TVControlButton
                icon='information-circle'
                onPress={handleToggleTechnicalInfo}
                disabled={false}
                hasTVPreferredFocus={!false && lastOpenedModal === "techInfo"}
                size={24}
              />
            )}
          </View>

          <View style={styles.trickplayBubbleContainer}>
            <TVTrickplayBubblePositioned
              trickPlayUrl={trickPlayUrl}
              trickplayInfo={trickplayInfo}
              time={seekBubbleTime}
              progress={effectiveProgress}
              max={max}
              progressBarWidth={progressBarWidth}
              visible={showSeekBubble}
            />
          </View>

          {/* Bidirectional focus guides - stacked together per docs */}
          {/* Downward: play button → progress bar */}
          {progressBarRef && (
            <TVFocusGuideView
              destinations={[progressBarRef]}
              style={styles.focusGuide}
            />
          )}
          {/* Upward: progress bar → play button */}
          {playButtonRef && (
            <TVFocusGuideView
              destinations={[playButtonRef]}
              style={styles.focusGuide}
            />
          )}

          {/* Progress bar with focus trapping for left/right */}
          <TVFocusGuideView trapFocusLeft trapFocusRight>
            <TVFocusableProgressBar
              progress={effectiveProgress}
              max={max}
              cacheProgress={cacheProgress}
              onFocus={() => setIsProgressBarFocused(true)}
              onBlur={() => setIsProgressBarFocused(false)}
              refSetter={setProgressBarRef}
              hasTVPreferredFocus={lastOpenedModal === null && !focusPlayButton}
            />
          </TVFocusGuideView>

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
    ...StyleSheet.absoluteFillObject,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
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
    fontSize: TVTypography.body,
  },
  titleText: {
    color: "#fff",
    fontSize: TVTypography.heading,
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
    bottom: 170,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  trickplayBubblePositioned: {
    position: "absolute",
    bottom: 0,
  },
  focusGuide: {
    height: 1,
    width: "100%",
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
    fontSize: TVTypography.body,
  },
  timeRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  endsAtText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: TVTypography.callout,
    marginTop: 2,
  },
  // Minimal seek bar styles
  minimalSeekBarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  minimalProgressWrapper: {
    // Match TVFocusableProgressBar padding for alignment
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  minimalProgressGlow: {
    // Same glow effect and scale as focused TVFocusableProgressBar
    shadowColor: "#fff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    transform: [{ scale: 1.02 }],
  },
  minimalProgressTrack: {
    // Brighter track like focused state
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});
