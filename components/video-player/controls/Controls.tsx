import { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useKeyEventListener } from "expo-key-event";
import { useLocalSearchParams } from "expo-router";
import {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import ContinueWatchingOverlay from "@/components/video-player/controls/ContinueWatchingOverlay";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { useMediaSegments } from "@/hooks/useMediaSegments";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useTrickplay } from "@/hooks/useTrickplay";
import type { TechnicalInfo } from "@/modules/mpv-player";
import { DownloadedItem } from "@/providers/Downloads/types";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import { hasChapterMarkers } from "@/utils/chapters";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { useSegments } from "@/utils/segments";
import { ticksToMs } from "@/utils/time";
import { BottomControls } from "./BottomControls";
import { CenterControls } from "./CenterControls";
import { CONTROLS_CONSTANTS } from "./constants";
import { EpisodeList } from "./EpisodeList";
import { GestureOverlay } from "./GestureOverlay";
import { HeaderControls } from "./HeaderControls";
import { useChapterNavigation } from "./hooks/useChapterNavigation";
import { useRemoteControl } from "./hooks/useRemoteControl";
import { useVideoNavigation } from "./hooks/useVideoNavigation";
import { useVideoSlider } from "./hooks/useVideoSlider";
import { useVideoTime } from "./hooks/useVideoTime";
import { SkipSegmentOverlay } from "./SkipSegmentOverlay";
import { TechnicalInfoOverlay } from "./TechnicalInfoOverlay";
import { useControlsTimeout } from "./useControlsTimeout";
import { PlaybackSpeedScope } from "./utils/playback-speed-settings";
import { type AspectRatio } from "./VideoScalingModeSelector";

interface Props {
  item: BaseItemDto;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering: boolean;
  showControls: boolean;
  enableTrickplay?: boolean;
  togglePlay: () => void;
  setShowControls: (shown: boolean) => void;
  mediaSource?: MediaSourceInfo | null;
  seek: (ticks: number) => void;
  startPictureInPicture?: () => Promise<void>;
  play: () => void;
  pause: () => void;
  aspectRatio?: AspectRatio;
  isZoomedToFill?: boolean;
  onZoomToggle?: () => void;
  api?: Api | null;
  downloadedFiles?: DownloadedItem[];
  // Playback speed props
  playbackSpeed?: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
  onHoldSpeedStart?: () => void;
  onHoldSpeedEnd?: () => void;
  // Technical info props
  showTechnicalInfo?: boolean;
  onToggleTechnicalInfo?: () => void;
  getTechnicalInfo?: () => Promise<TechnicalInfo>;
  playMethod?: "DirectPlay" | "DirectStream" | "Transcode";
  transcodeReasons?: string[];
}

const CONTROLS_ANIMATION_CONFIG = {
  duration: 300,
  easing: Easing.out(Easing.quad),
};

// Shares its duration with the scrim dim in GestureOverlay so both halves
// of the speed boost dim together
const HOLD_SPEED_DIM_CONFIG = {
  duration: CONTROLS_CONSTANTS.HOLD_SPEED_DIM_DURATION,
  easing: Easing.out(Easing.quad),
};

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
  aspectRatio = "default",
  isZoomedToFill = false,
  onZoomToggle,
  api = null,
  downloadedFiles = undefined,
  playbackSpeed = 1.0,
  setPlaybackSpeed,
  onHoldSpeedStart,
  onHoldSpeedEnd,
  showTechnicalInfo = false,
  onToggleTechnicalInfo,
  getTechnicalInfo,
  playMethod,
  transcodeReasons,
}) => {
  const offline = useOfflineMode();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const lightHapticFeedback = useHaptic("light");

  const [episodeView, setEpisodeView] = useState(false);
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

  const min = useSharedValue(0);
  // Regular value for use during render (avoids Reanimated warning)
  const maxMs = ticksToMs(item.RunTimeTicks || 0);
  const max = useSharedValue(maxMs);

  // Animation values for controls
  const controlsOpacity = useSharedValue(showControls ? 1 : 0);
  const headerTranslateY = useSharedValue(showControls ? 0 : -50);
  const bottomTranslateY = useSharedValue(showControls ? 0 : 50);

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, [prefetchAllTrickplayImages]);

  // Animate controls visibility
  useEffect(() => {
    controlsOpacity.value = withTiming(
      showControls ? 1 : 0,
      CONTROLS_ANIMATION_CONFIG,
    );
    headerTranslateY.value = withTiming(
      showControls ? 0 : -10,
      CONTROLS_ANIMATION_CONFIG,
    );
    bottomTranslateY.value = withTiming(
      showControls ? 0 : 10,
      CONTROLS_ANIMATION_CONFIG,
    );
  }, [showControls, controlsOpacity, headerTranslateY, bottomTranslateY]);

  // Dim the controls while a speed boost is held so the video stays readable
  const handleHoldSpeedStart = useCallback(() => {
    if (showControls) {
      controlsOpacity.value = withTiming(
        CONTROLS_CONSTANTS.HOLD_SPEED_DIM_OPACITY,
        HOLD_SPEED_DIM_CONFIG,
      );
    }
    onHoldSpeedStart?.();
  }, [showControls, controlsOpacity, onHoldSpeedStart]);

  const handleHoldSpeedEnd = useCallback(() => {
    if (showControls) {
      controlsOpacity.value = withTiming(1, HOLD_SPEED_DIM_CONFIG);
    }
    onHoldSpeedEnd?.();
  }, [showControls, controlsOpacity, onHoldSpeedEnd]);

  // Top edge of the rendered video, so overlays sit inside the frame
  // instead of in the letterbox bars
  const videoTopOffset = useMemo(() => {
    if (isZoomedToFill) return 0;
    const videoStream = mediaSource?.MediaStreams?.find(
      (s) => s.Type === "Video",
    );
    if (!videoStream?.Width || !videoStream?.Height) return 0;
    const videoAspect = videoStream.Width / videoStream.Height;
    const screenAspect = screenWidth / screenHeight;
    if (screenAspect >= videoAspect) return 0;
    return (screenHeight - screenWidth / videoAspect) / 2;
  }, [isZoomedToFill, mediaSource, screenWidth, screenHeight]);

  // Create animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  }));

  const centerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  }));

  const bottomAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: bottomTranslateY.value }],
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  }));

  // Initialize progress values - MPV uses milliseconds
  useEffect(() => {
    if (item) {
      progress.value = ticksToMs(item?.UserData?.PlaybackPositionTicks);
      max.value = ticksToMs(item.RunTimeTicks || 0);
    }
  }, [item, progress, max]);

  // Navigation hooks
  const {
    handleSeekBackward,
    handleSeekForward,
    handleSkipBackward,
    handleSkipForward,
  } = useVideoNavigation({
    progress,
    isPlaying,
    seek,
    play,
  });

  useKeyEventListener((e) => {
    if (episodeView || showAudioSlider) return;
    if (e?.eventType !== "press") return;
    const key = e.key;

    if (key === " " || key === "Spacebar" || key === "Space") {
      togglePlay();
    } else if (!Platform.isTV && key === "ArrowLeft") {
      // Exclude TV platforms to prevent conflicts with the remote control,
      // which uses the same arrow keys for directional UI navigation.
      handleSkipBackward();
    } else if (!Platform.isTV && key === "ArrowRight") {
      handleSkipForward();
    }
  });

  // Time management hook
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
  } = useChapterNavigation({
    chapters: item.Chapters,
    progress,
    maxMs,
    seek,
  });

  const toggleControls = useCallback(() => {
    if (showControls) {
      setShowAudioSlider(false);
      setShowControls(false);
    } else {
      setShowControls(true);
    }
  }, [showControls, setShowControls]);

  // Remote control hook
  const {
    remoteScrubProgress,
    isRemoteScrubbing,
    showRemoteBubble,
    isSliding: isRemoteSliding,
    time: remoteTime,
  } = useRemoteControl({
    progress,
    min,
    max,
    showControls,
    isPlaying,
    seek,
    play,
    togglePlay,
    toggleControls,
    calculateTrickplayUrl,
    handleSeekForward,
    handleSeekBackward,
  });

  // Slider hook
  const {
    isSliding,
    time,
    handleSliderStart,
    handleTouchStart,
    handleTouchEnd,
    handleSliderComplete,
    handleSliderChange,
    seekTo,
  } = useVideoSlider({
    progress,
    isSeeking,
    isPlaying,
    seek,
    play,
    pause,
    calculateTrickplayUrl,
    showControls,
  });

  const effectiveProgress = useSharedValue(0);

  // Recompute progress whenever remote scrubbing is active or when progress significantly changes
  useAnimatedReaction(
    () => ({
      isScrubbing: isRemoteScrubbing.value,
      scrub: remoteScrubProgress.value,
      actual: progress.value,
    }),
    (current, previous) => {
      // Always update if scrubbing state changed or we're currently scrubbing
      if (
        current.isScrubbing !== previous?.isScrubbing ||
        current.isScrubbing
      ) {
        effectiveProgress.value =
          current.isScrubbing && current.scrub != null
            ? current.scrub
            : current.actual;
      } else {
        // When not scrubbing, only update if progress changed significantly (1 second)
        // MPV uses milliseconds
        const progressUnit = CONTROLS_CONSTANTS.PROGRESS_UNIT_MS;
        const progressDiff = Math.abs(current.actual - effectiveProgress.value);
        if (progressDiff >= progressUnit) {
          effectiveProgress.value = current.actual;
        }
      }
    },
    [],
  );

  const { bitrateValue, subtitleIndex, audioIndex } = useLocalSearchParams<{
    bitrateValue: string;
    audioIndex: string;
    subtitleIndex: string;
  }>();

  // Fetch all segments for the current item
  const { data: segments } = useSegments(
    item.Id ?? "",
    offline,
    downloadedFiles,
    api,
  );

  // Unified segment orchestration (identical mechanism on mobile and TV):
  // overlap priority + a single auto-skip driver live in the shared hook.
  const {
    activeSegment,
    skipActiveSegment: onSkipSegment,
    showSkipButton: showSkipSegmentButton,
    isOutroActive: showSkipOutroButton,
    skipOutro: onSkipOutro,
    hasContentAfterCredits,
  } = useMediaSegments({
    segments,
    currentTime,
    maxMs,
    seek,
    play,
    isPlaying,
    isBuffering,
  });

  const { t } = useTranslation();
  const skipSegmentButtonText = activeSegment
    ? t(`player.skip_${activeSegment.type.toLowerCase()}`)
    : t("player.skip_intro");
  const skipOutroButtonText = t("player.skip_outro");

  // Same gate as the bookmark icon in BottomControls, so the skip overlay
  // only shifts left when the icon is actually shown.
  const showsChapterIcon = useMemo(
    () => hasChapterMarkers(item.Chapters, maxMs),
    [item.Chapters, maxMs],
  );

  // Whether the "Next Episode" countdown can be rendered at all. The Skip
  // Credits button yields to it only when this is true; if autoplay is
  // disabled or its episode limit is reached, Skip Credits must stay available.
  const willShowNextEpisode =
    !!nextItem &&
    settings.autoPlayNextEpisode !== false &&
    (settings.maxAutoPlayEpisodeCount.value === -1 ||
      settings.autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value);

  // Credits segment metadata (hasContentAfterCredits) can be wrong, so this
  // path only swaps Skip Credits for a manually-tappable Next Episode button
  // — it must never auto-advance on its own.
  const showNextEpisodeFromCredits =
    willShowNextEpisode && showSkipOutroButton && !hasContentAfterCredits;

  // Driven by actual playback position vs. duration, independent of segment
  // metadata, so it's safe to auto-advance from this trigger.
  const showNextEpisodeFromRemainingTime =
    willShowNextEpisode &&
    remainingTime < CONTROLS_CONSTANTS.NEXT_EPISODE_COUNTDOWN_MS;

  const showNextEpisode =
    showNextEpisodeFromCredits || showNextEpisodeFromRemainingTime;
  // Whether reaching the end of the item may advance on its own. Pausing is
  // not a reason to take that away: the countdown follows the remaining time,
  // which stops moving while playback does.
  const autoAdvanceNextEpisode = showNextEpisodeFromRemainingTime;

  // Autoplay would run at EOF but the episode cap stops it: ask "Still
  // watching?" there instead, with playback paused — mirroring the native
  // player's stillWatchingRequired flow. Gated on reaching the end so the
  // prompt never covers a video that is still playing.
  const stillWatchingRequired =
    !!nextItem &&
    settings.autoPlayNextEpisode !== false &&
    settings.maxAutoPlayEpisodeCount.value !== -1 &&
    settings.autoPlayEpisodeCount >= settings.maxAutoPlayEpisodeCount.value;

  const [stillWatchingVisible, setStillWatchingVisible] = useState(false);
  // The cap-hitting autoplay updates the episode count synchronously while
  // currentTime/remainingTime still hold the outgoing episode's near-zero
  // values (the next item loads async), so "at EOF" alone would fire the
  // prompt over the incoming episode. Only a progress tick from mid-playback
  // of the final episode itself arms the trigger.
  const stillWatchingArmedRef = useRef(false);

  // Reset after an in-place episode switch (setParams keeps Controls mounted).
  useEffect(() => {
    stillWatchingArmedRef.current = false;
    setStillWatchingVisible(false);
  }, [item.Id]);

  useEffect(() => {
    if (!stillWatchingRequired || stillWatchingVisible || maxMs <= 0) {
      return;
    }
    if (
      currentTime > 0 &&
      remainingTime > CONTROLS_CONSTANTS.STILL_WATCHING_EOF_WINDOW_MS
    ) {
      stillWatchingArmedRef.current = true;
      return;
    }
    if (
      stillWatchingArmedRef.current &&
      remainingTime <= CONTROLS_CONSTANTS.STILL_WATCHING_EOF_WINDOW_MS
    ) {
      setStillWatchingVisible(true);
      pause();
    }
  }, [
    stillWatchingVisible,
    stillWatchingRequired,
    maxMs,
    currentTime,
    remainingTime,
    pause,
  ]);

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
      } = getDefaultPlaySettings(item, settings, {
        indexes: previousIndexes,
        source: mediaSource ?? undefined,
      });

      // Use setParams instead of replace to avoid unmounting/remounting the player,
      // which would create a new MPV native view and crash with "mp_initialize already initialized".
      router.setParams({
        ...(offline && { offline: "true" }),
        itemId: item.Id ?? "",
        audioIndex: defaultAudioIndex?.toString() ?? "",
        subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
        mediaSourceId: newMediaSource?.Id ?? "",
        bitrateValue: bitrateValue?.toString(),
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "",
      });
    },
    [
      settings,
      subtitleIndex,
      audioIndex,
      mediaSource,
      bitrateValue,
      router,
      offline,
    ],
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

      // Same boundary as the countdown's willShowNextEpisode gate — the
      // countdown must never complete without actually navigating.
      if (
        settings.autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value
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

  const hideControls = useCallback(() => {
    setShowControls(false);
    setShowAudioSlider(false);
  }, [setShowControls]);

  const { handleControlsInteraction } = useControlsTimeout({
    showControls,
    isSliding: isSliding || isRemoteSliding,
    episodeView,
    onHideControls: hideControls,
    timeout: CONTROLS_CONSTANTS.TIMEOUT,
    disabled: true,
  });

  const switchOnEpisodeMode = useCallback(() => {
    setEpisodeView(true);
    if (isPlaying) {
      togglePlay();
    }
  }, [isPlaying, togglePlay]);

  return (
    <View style={styles.controlsContainer} pointerEvents='box-none'>
      {episodeView ? (
        <EpisodeList
          item={item}
          close={() => setEpisodeView(false)}
          goToItem={goToItemCommon}
        />
      ) : (
        <>
          <GestureOverlay
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            showControls={showControls}
            onToggleControls={toggleControls}
            onSkipForward={handleSkipForward}
            onSkipBackward={handleSkipBackward}
            onHoldSpeedStart={handleHoldSpeedStart}
            onHoldSpeedEnd={handleHoldSpeedEnd}
            isPlaying={isPlaying}
            videoTopOffset={videoTopOffset}
          />
          {/* Technical Info Overlay - rendered outside animated views to stay visible */}
          {getTechnicalInfo && (
            <TechnicalInfoOverlay
              showControls={showControls}
              visible={showTechnicalInfo}
              getTechnicalInfo={getTechnicalInfo}
              playMethod={playMethod}
              transcodeReasons={transcodeReasons}
              mediaSource={mediaSource}
              item={item}
            />
          )}
          <Animated.View
            style={headerAnimatedStyle}
            pointerEvents={showControls ? "auto" : "none"}
          >
            <HeaderControls
              item={item}
              showControls={showControls}
              offline={offline}
              mediaSource={mediaSource}
              startPictureInPicture={startPictureInPicture}
              switchOnEpisodeMode={switchOnEpisodeMode}
              goToPreviousItem={goToPreviousItem}
              goToNextItem={goToNextItem}
              previousItem={previousItem}
              nextItem={nextItem}
              aspectRatio={aspectRatio}
              isZoomedToFill={isZoomedToFill}
              onZoomToggle={onZoomToggle}
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              showTechnicalInfo={showTechnicalInfo}
              onToggleTechnicalInfo={onToggleTechnicalInfo}
            />
          </Animated.View>
          <Animated.View
            style={centerAnimatedStyle}
            pointerEvents={showControls ? "box-none" : "none"}
          >
            <CenterControls
              showControls={showControls}
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              showAudioSlider={showAudioSlider}
              setShowAudioSlider={setShowAudioSlider}
              togglePlay={togglePlay}
              handleSkipBackward={handleSkipBackward}
              handleSkipForward={handleSkipForward}
              hasChapters={hasChapters}
              hasPreviousChapter={hasPreviousChapter}
              hasNextChapter={hasNextChapter}
              goToPreviousChapter={goToPreviousChapter}
              goToNextChapter={goToNextChapter}
            />
          </Animated.View>
          <Animated.View
            style={bottomAnimatedStyle}
            pointerEvents={showControls ? "auto" : "none"}
          >
            <BottomControls
              item={item}
              chapters={item.Chapters}
              durationMs={maxMs}
              showControls={showControls}
              isSliding={isSliding}
              showRemoteBubble={showRemoteBubble}
              currentTime={currentTime}
              remainingTime={remainingTime}
              handleControlsInteraction={handleControlsInteraction}
              min={min}
              max={max}
              effectiveProgress={effectiveProgress}
              cacheProgress={cacheProgress}
              handleSliderStart={handleSliderStart}
              handleSliderComplete={handleSliderComplete}
              handleSliderChange={handleSliderChange}
              handleTouchStart={handleTouchStart}
              handleTouchEnd={handleTouchEnd}
              seekTo={seekTo}
              trickPlayUrl={trickPlayUrl}
              trickplayInfo={trickplayInfo}
              time={isSliding || showRemoteBubble ? time : remoteTime}
            />
          </Animated.View>
          {/* Skip Intro / Skip Credits float independently of the controls so
              they're visible (and tappable) without summoning the controls. */}
          <SkipSegmentOverlay
            showSkipButton={showSkipSegmentButton}
            skipButtonText={skipSegmentButtonText}
            showSkipCreditButton={showSkipOutroButton}
            skipCreditButtonText={skipOutroButtonText}
            hasContentAfterCredits={hasContentAfterCredits}
            willShowNextEpisode={willShowNextEpisode}
            showNextEpisode={showNextEpisode}
            autoAdvanceNextEpisode={autoAdvanceNextEpisode}
            remainingTime={remainingTime}
            isPlaying={isPlaying}
            itemId={item.Id}
            skipIntro={onSkipSegment}
            skipCredit={onSkipOutro}
            onNextEpisodeFinish={handleNextEpisodeAutoPlay}
            onNextEpisodePress={handleNextEpisodeManual}
            controlsVisible={showControls}
            hasChapters={showsChapterIcon}
          />
        </>
      )}
      {stillWatchingVisible && (
        <ContinueWatchingOverlay goToNextItem={handleContinueWatching} />
      )}
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
});
