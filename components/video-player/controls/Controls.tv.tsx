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
  Pressable,
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
import {
  TVControlButton,
  TVNextEpisodeCountdown,
  TVSkipSegmentCard,
} from "@/components/tv";
import { TVFocusableProgressBar } from "@/components/tv/TVFocusableProgressBar";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useTrickplay } from "@/hooks/useTrickplay";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { useTVSubtitleModal } from "@/hooks/useTVSubtitleModal";
import type { TechnicalInfo } from "@/modules/mpv-player";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { compareTracksForMenu } from "@/utils/jellyfin/subtitleUtils";
import { formatTimeString, msToTicks, ticksToMs } from "@/utils/time";
import { CONTROLS_CONSTANTS } from "./constants";
import { useVideoContext } from "./contexts/VideoContext";
import { useChapterNavigation } from "./hooks/useChapterNavigation";
import { useRemoteControl } from "./hooks/useRemoteControl";
import { useVideoTime } from "./hooks/useVideoTime";
import { TechnicalInfoOverlay } from "./TechnicalInfoOverlay";
import { TrickplayBubble } from "./TrickplayBubble";
import type { Track } from "./types";
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
  downloadedFiles?: DownloadedItem[];
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
  downloadedFiles,
}) => {
  const typography = useScaledTVTypography();
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
  const { bitrateValue } = useLocalSearchParams<{
    bitrateValue: string;
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
  const [skipSegmentRef, setSkipSegmentRef] = useState<View | null>(null);
  const [nextEpisodeRef, setNextEpisodeRef] = useState<View | null>(null);

  // Minimal seek bar state (shows only progress bar when seeking while controls hidden)
  const [showMinimalSeekBar, setShowMinimalSeekBar] = useState(false);
  const minimalSeekBarOpacity = useSharedValue(0);
  const minimalSeekBarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Ref for the invisible focus-stealing overlay (prevents hidden buttons from receiving select events)
  const focusOverlayRef = useRef<View>(null);

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

  // Re-fetch subtitle streams from the server (e.g. after a server-side
  // download) and map them to the modal's Track shape. setTrack drives the
  // player through the same handler used for manual subtitle selection.
  const refreshSubtitleTracks = useCallback(async (): Promise<Track[]> => {
    try {
      const streams = (await onRefreshSubtitleTracks?.()) ?? [];
      // Skip streams without a real index: `?? -1` would alias them to the
      // "disable subtitles" sentinel and mis-route selection. Order like
      // jellyfin-web (embedded first, externals last, forced/default up).
      return [...streams]
        .sort(compareTracksForMenu)
        .filter((stream) => typeof stream.Index === "number")
        .map((stream) => {
          const index = stream.Index as number;
          return {
            name:
              stream.DisplayTitle ||
              `${stream.Language || "Unknown"} (${stream.Codec})`,
            index,
            setTrack: () => onSubtitleIndexChange?.(index),
          };
        });
    } catch {
      return [];
    }
  }, [onRefreshSubtitleTracks, onSubtitleIndexChange]);

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

  // Chapter navigation hook
  const {
    hasChapters,
    hasPreviousChapter,
    hasNextChapter,
    goToPreviousChapter,
    goToNextChapter,
    chapterPositions,
  } = useChapterNavigation({
    chapters: item.Chapters,
    progress,
    maxMs,
    seek,
  });

  // Skip intro/credits hooks
  // Note: hooks expect seek callback that takes ms, and seek prop already expects ms
  const offline = useOfflineMode();
  const { showSkipButton, skipIntro } = useIntroSkipper(
    item.Id!,
    currentTime,
    seek,
    _play,
    offline,
    api,
    downloadedFiles,
  );

  const { showSkipCreditButton, skipCredit, hasContentAfterCredits } =
    useCreditSkipper(
      item.Id!,
      currentTime,
      seek,
      _play,
      offline,
      api,
      downloadedFiles,
      max.value,
    );

  // Countdown logic
  const isCountdownActive = useMemo(() => {
    if (!nextItem) return false;
    if (item?.Type !== "Episode") return false;
    return remainingTime > 0 && remainingTime <= 10000;
  }, [nextItem, item, remainingTime]);

  // Simple boolean - when skip cards or countdown are visible, they have focus
  const isSkipOrCountdownVisible = useMemo(() => {
    const skipIntroVisible = showSkipButton && !isCountdownActive;
    const skipCreditsVisible =
      showSkipCreditButton &&
      (hasContentAfterCredits || !nextItem) &&
      !isCountdownActive;
    return skipIntroVisible || skipCreditsVisible || isCountdownActive;
  }, [
    showSkipButton,
    showSkipCreditButton,
    hasContentAfterCredits,
    nextItem,
    isCountdownActive,
  ]);

  // Live TV detection - check for both Program (when playing from guide) and TvChannel (when playing from channels)
  const isLiveTV = item?.Type === "Program" || item?.Type === "TvChannel";

  // For live TV, determine if we're at the live edge (within 5 seconds of max)
  const LIVE_EDGE_THRESHOLD = 5000; // 5 seconds in ms

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
    if (isSkipOrCountdownVisible) return; // Skip/countdown has focus, don't toggle
    setShowControls(!showControls);
  }, [showControls, setShowControls, isSkipOrCountdownVisible]);

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
  const exitingRef = useRef(false);
  const [isExiting, setIsExiting] = useState(false);

  const updateSeekBubbleTime = useCallback((ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    setSeekBubbleTime({ hours, minutes, seconds });
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
    // Filter out the "Disable" option from VideoContext tracks since the modal adds its own "None" option.
    // Wrap each setTrack so selecting a subtitle ALSO updates the player's live
    // index via onSubtitleIndexChange. The modal is a separate route, so the
    // VideoContext router.setParams inside setTrack targets the modal — not the
    // player — leaving currentSubtitleIndex stale. Without this sync, the next
    // episode carries the previously-shown subtitle instead of the one the user
    // just picked. (The audio sheet already uses onAudioIndexChange directly.)
    const tracksWithoutDisable = (videoContextSubtitleTracks ?? [])
      .filter((track) => track.index !== -1)
      .map((track) => ({
        ...track,
        setTrack: () => {
          track.setTrack();
          onSubtitleIndexChange?.(track.index);
        },
      }));
    showSubtitleModal({
      item,
      mediaSourceId: mediaSource?.Id,
      subtitleTracks: tracksWithoutDisable,
      currentSubtitleIndex: subtitleIndex ?? -1,
      // In-player selection can navigate (replacePlayer for burn-in switches);
      // apply it after the modal route is dismissed so it isn't swallowed.
      deferApplyUntilDismissed: true,
      onDisableSubtitles: () => {
        // Find and call the "Disable" track's setTrack from VideoContext
        const disableTrack = videoContextSubtitleTracks?.find(
          (t) => t.index === -1,
        );
        disableTrack?.setTrack();
        onSubtitleIndexChange?.(-1);
      },
      onLocalSubtitleDownloaded: handleLocalSubtitleDownloaded,
      refreshSubtitleTracks: onRefreshSubtitleTracks
        ? refreshSubtitleTracks
        : undefined,
    });
    controlsInteractionRef.current();
  }, [
    showSubtitleModal,
    item,
    mediaSource?.Id,
    videoContextSubtitleTracks,
    subtitleIndex,
    onSubtitleIndexChange,
    handleLocalSubtitleDownloaded,
    onRefreshSubtitleTracks,
    refreshSubtitleTracks,
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
    // For live TV, check if we're already at the live edge
    if (isLiveTV && max.value - progress.value < LIVE_EDGE_THRESHOLD) {
      // Already at live edge, don't seek further
      controlsInteractionRef.current();
      return;
    }

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
  }, [
    progress,
    max,
    seek,
    calculateTrickplayUrl,
    updateSeekBubbleTime,
    isLiveTV,
  ]);

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
    // For live TV, check if we're already at the live edge
    if (isLiveTV && max.value - progress.value < LIVE_EDGE_THRESHOLD) {
      // Already at live edge, don't seek further
      controlsInteractionRef.current();
      return;
    }

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
  }, [
    progress,
    max,
    seek,
    calculateTrickplayUrl,
    updateSeekBubbleTime,
    isLiveTV,
  ]);

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
    // For live TV, check if we're already at the live edge
    if (isLiveTV && max.value - progress.value < LIVE_EDGE_THRESHOLD) {
      // Already at live edge, don't seek further
      return;
    }

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
    isLiveTV,
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
    // For live TV, check if we're already at the live edge
    if (isLiveTV && max.value - progress.value < LIVE_EDGE_THRESHOLD) {
      // Already at live edge, don't start continuous seeking
      return;
    }

    seekAccelerationRef.current = 1;

    handleSeekForwardButton();

    continuousSeekRef.current = setInterval(() => {
      // For live TV, stop continuous seeking when we hit the live edge
      if (isLiveTV && max.value - progress.value < LIVE_EDGE_THRESHOLD) {
        stopContinuousSeeking();
        return;
      }

      const seekAmount =
        CONTROLS_CONSTANTS.LONG_PRESS_INITIAL_SEEK *
        seekAccelerationRef.current *
        1000;
      const newPosition = Math.min(max.value, progress.value + seekAmount);
      progress.value = newPosition;
      seek(newPosition);

      calculateTrickplayUrl(msToTicks(newPosition));
      updateSeekBubbleTime(newPosition);

      seekAccelerationRef.current = Math.min(
        seekAccelerationRef.current *
          CONTROLS_CONSTANTS.LONG_PRESS_ACCELERATION,
        CONTROLS_CONSTANTS.LONG_PRESS_MAX_ACCELERATION,
      );

      controlsInteractionRef.current();
    }, CONTROLS_CONSTANTS.LONG_PRESS_INTERVAL);
  }, [
    handleSeekForwardButton,
    max,
    progress,
    seek,
    calculateTrickplayUrl,
    updateSeekBubbleTime,
    isLiveTV,
    stopContinuousSeeking,
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

      seekAccelerationRef.current = Math.min(
        seekAccelerationRef.current *
          CONTROLS_CONSTANTS.LONG_PRESS_ACCELERATION,
        CONTROLS_CONSTANTS.LONG_PRESS_MAX_ACCELERATION,
      );

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
    if (isSkipOrCountdownVisible) return; // Skip/countdown has focus, don't show controls
    setFocusPlayButton(true);
    setShowControls(true);
  }, [setShowControls, isSkipOrCountdownVisible]);

  const hideControls = useCallback(() => {
    setShowControls(false);
    setFocusPlayButton(false);
  }, [setShowControls]);

  // When controls hide (and no skip/countdown overlay is visible), move focus
  // to the invisible overlay so hidden buttons can't receive select events.
  useEffect(() => {
    if (!showControls && !isSkipOrCountdownVisible) {
      // Small delay to let the controls fade-out animation start and
      // the focus engine settle before stealing focus
      const t = setTimeout(() => {
        focusOverlayRef.current?.focus();
      }, 100);
      return () => clearTimeout(t);
    }
  }, [showControls, isSkipOrCountdownVisible]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleWillExit = useCallback(() => {
    exitingRef.current = true;
    setIsExiting(true);
  }, []);

  const handleCancelExit = useCallback(() => {
    exitingRef.current = false;
    setIsExiting(false);
  }, []);

  const { isSliding: isRemoteSliding } = useRemoteControl({
    showControls: showControls,
    toggleControls,
    togglePlay,
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
    onHideControls: hideControls,
    onBack: handleBack,
    onWillExit: handleWillExit,
    onCancelExit: handleCancelExit,
    videoTitle: item?.Name ?? undefined,
  });

  const { handleControlsInteraction } = useControlsTimeout({
    showControls: showControls,
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

      // Use the live selection passed down from the player (currentSubtitleIndex
      // / currentAudioIndex), not the stale URL params the episode started with.
      // This path runs on autoplay; the manual "Next" button uses goToNextItemProp.
      const previousIndexes = {
        subtitleIndex,
        audioIndex,
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
      subtitleIndex,
      audioIndex,
      mediaSource,
      bitrateValue,
      router,
    ],
  );

  goToNextItemRef.current = goToNextItem;

  const handleAutoPlayFinish = useCallback(() => {
    if (exitingRef.current) return;
    goToNextItem({ isAutoPlay: true });
  }, [goToNextItem]);

  const topOverlayFocusTarget = skipSegmentRef ?? nextEpisodeRef;

  return (
    <View style={styles.controlsContainer} pointerEvents='box-none'>
      <Animated.View
        style={[styles.darkOverlay, overlayAnimatedStyle]}
        pointerEvents='none'
      />

      {/* Invisible overlay that steals focus when controls are hidden.
          Prevents hidden control buttons from receiving select/enter events
          from the TV remote. Pressing center button here toggles play/pause. */}
      <Pressable
        ref={focusOverlayRef}
        style={styles.focusStealingOverlay}
        pointerEvents={
          showControls || isSkipOrCountdownVisible ? "none" : "auto"
        }
        focusable={!showControls && !isSkipOrCountdownVisible}
        hasTVPreferredFocus={!showControls && !isSkipOrCountdownVisible}
        onPress={() => {
          togglePlay();
          setShowControls(true);
          setFocusPlayButton(true);
        }}
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

      {/* Skip intro card */}
      <TVSkipSegmentCard
        show={showSkipButton && !isCountdownActive}
        onPress={skipIntro}
        type='intro'
        controlsVisible={showControls}
        refSetter={setSkipSegmentRef}
        hasTVPreferredFocus={!showControls}
        playButtonRef={showControls ? playButtonRef : null}
      />

      {/* Skip credits card - show when there's content after credits, OR no next episode */}
      <TVSkipSegmentCard
        show={
          showSkipCreditButton &&
          (hasContentAfterCredits || !nextItem) &&
          !isCountdownActive
        }
        onPress={skipCredit}
        type='credits'
        controlsVisible={showControls}
        refSetter={setSkipSegmentRef}
        hasTVPreferredFocus={!showControls}
        playButtonRef={showControls ? playButtonRef : null}
      />

      {nextItem && (
        <TVNextEpisodeCountdown
          nextItem={nextItem}
          api={api}
          show={isCountdownActive}
          isPlaying={isPlaying && !isExiting}
          onFinish={handleAutoPlayFinish}
          onPlayNext={handleNextItemButton}
          controlsVisible={showControls}
          refSetter={setNextEpisodeRef}
          hasTVPreferredFocus={!showControls}
          playButtonRef={showControls ? playButtonRef : null}
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
              <View style={styles.minimalProgressTrackWrapper}>
                <View
                  style={[styles.progressTrack, styles.minimalProgressTrack]}
                >
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
                {/* Chapter markers */}
                {chapterPositions.length > 0 && (
                  <View
                    style={styles.minimalChapterMarkersContainer}
                    pointerEvents='none'
                  >
                    {chapterPositions.map((position, index) => (
                      <View
                        key={`minimal-chapter-marker-${index}`}
                        style={[
                          styles.minimalChapterMarker,
                          { left: `${position}%` },
                        ]}
                      />
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.timeContainer}>
            <Text style={[styles.timeText, { fontSize: typography.body }]}>
              {formatTimeString(currentTime, "ms")}
            </Text>
            {!isLiveTV && (
              <View style={styles.timeRight}>
                <Text style={[styles.timeText, { fontSize: typography.body }]}>
                  -{formatTimeString(remainingTime, "ms")}
                </Text>
                <Text
                  style={[styles.endsAtText, { fontSize: typography.callout }]}
                >
                  {t("player.ends_at", { time: getFinishTime() })}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.bottomContainer, bottomAnimatedStyle]}
        pointerEvents={showControls ? "auto" : "none"}
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
                style={[styles.subtitleText, { fontSize: typography.body }]}
              >{`${item.SeriesName} - ${item.SeasonName} Episode ${item.IndexNumber}`}</Text>
            )}
            <View style={styles.titleRow}>
              <Text
                style={[styles.titleText, { fontSize: typography.heading }]}
              >
                {item?.Name}
              </Text>
              {isLiveTV && (
                <View style={styles.liveBadge}>
                  <Text
                    style={[
                      styles.liveBadgeText,
                      { fontSize: typography.callout },
                    ]}
                  >
                    {t("player.live")}
                  </Text>
                </View>
              )}
            </View>
            {item?.Type === "Movie" && (
              <Text
                style={[styles.subtitleText, { fontSize: typography.body }]}
              >
                {item?.ProductionYear}
              </Text>
            )}
          </View>

          {/* Upward: control buttons → visible skip segment or next episode card */}
          {topOverlayFocusTarget && (
            <TVFocusGuideView
              destinations={[topOverlayFocusTarget]}
              style={styles.focusGuide}
            />
          )}

          <View style={styles.controlButtonsRow}>
            <TVControlButton
              icon='play-skip-back'
              onPress={handlePreviousItem}
              disabled={!previousItem}
              size={28}
            />
            {hasChapters && (
              <TVControlButton
                icon='play-back'
                onPress={goToPreviousChapter}
                disabled={!hasPreviousChapter}
                size={24}
              />
            )}
            <TVControlButton
              icon={isPlaying ? "pause" : "play"}
              onPress={handlePlayPauseButton}
              size={36}
              refSetter={setPlayButtonRef}
              hasTVPreferredFocus={
                !isCountdownActive &&
                focusPlayButton &&
                lastOpenedModal === null
              }
            />
            {hasChapters && (
              <TVControlButton
                icon='play-forward'
                onPress={goToNextChapter}
                disabled={!hasNextChapter}
                size={24}
              />
            )}
            <TVControlButton
              icon='play-skip-forward'
              onPress={handleNextItemButton}
              disabled={!nextItem}
              size={28}
            />

            <View style={styles.controlButtonsSpacer} />

            {audioOptions.length > 0 && (
              <TVControlButton
                icon='volume-high'
                onPress={handleOpenAudioSheet}
                hasTVPreferredFocus={
                  !isCountdownActive && lastOpenedModal === "audio"
                }
                size={24}
              />
            )}

            <TVControlButton
              icon='text'
              onPress={handleOpenSubtitleSheet}
              hasTVPreferredFocus={
                !isCountdownActive && lastOpenedModal === "subtitle"
              }
              size={24}
            />

            {getTechnicalInfo && (
              <TVControlButton
                icon='code-slash'
                onPress={handleToggleTechnicalInfo}
                hasTVPreferredFocus={
                  !isCountdownActive && lastOpenedModal === "techInfo"
                }
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
              chapterPositions={chapterPositions}
              onFocus={() => setIsProgressBarFocused(true)}
              onBlur={() => setIsProgressBarFocused(false)}
              refSetter={setProgressBarRef}
              hasTVPreferredFocus={false}
            />
          </TVFocusGuideView>

          <View style={styles.timeContainer}>
            <Text style={[styles.timeText, { fontSize: typography.body }]}>
              {formatTimeString(currentTime, "ms")}
            </Text>
            {!isLiveTV && (
              <View style={styles.timeRight}>
                <Text style={[styles.timeText, { fontSize: typography.body }]}>
                  -{formatTimeString(remainingTime, "ms")}
                </Text>
                <Text
                  style={[styles.endsAtText, { fontSize: typography.callout }]}
                >
                  {t("player.ends_at", { time: getFinishTime() })}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  controlsContainer: {
    ...StyleSheet.absoluteFill,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  focusStealingOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  subtitleText: {
    color: "rgba(255,255,255,0.6)",
  },
  titleText: {
    color: "#fff",
    fontWeight: "bold",
  },
  liveBadge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveBadgeText: {
    color: "#FFF",
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
    bottom: 190,
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
  },
  timeRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  endsAtText: {
    color: "rgba(255,255,255,0.5)",
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
  minimalProgressTrackWrapper: {
    position: "relative",
    height: TV_SEEKBAR_HEIGHT,
  },
  minimalChapterMarkersContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  minimalChapterMarker: {
    position: "absolute",
    width: 2,
    height: TV_SEEKBAR_HEIGHT + 5,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 1,
    transform: [{ translateX: -1 }],
  },
});
