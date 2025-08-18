import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useRouter } from "expo-router";
import {
  type Dispatch,
  type FC,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useWindowDimensions } from "react-native";
import {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import ContinueWatchingOverlay from "@/components/video-player/controls/ContinueWatchingOverlay";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useHaptic } from "@/hooks/useHaptic";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { useTrickplay } from "@/hooks/useTrickplay";
import type { TrackInfo, VlcPlayerViewRef } from "@/modules/VlcPlayer.types";
import { useSettings } from "@/utils/atoms/settings";
import { BottomControls } from "./components/BottomControls";
import { CenterControls } from "./components/CenterControls";
// Extracted components
import { TopControlsBar } from "./components/TopControlsBar";
// Constants and utilities
import { ANIMATION_DURATION, CONTROLS_TIMEOUT } from "./constants";
import { ControlProvider } from "./contexts/ControlContext";
import { EpisodeList } from "./EpisodeList";
import { useEpisodeNavigation } from "./hooks/useEpisodeNavigation";
// Extracted hooks
import { useRemoteControls } from "./hooks/useRemoteControls";
import { useSkipControls } from "./hooks/useSkipControls";
import { useSliderInteractions } from "./hooks/useSliderInteractions";
import { useTimeManagement } from "./hooks/useTimeManagement";
import { useVideoScaling } from "./hooks/useVideoScaling";
import { type ScaleFactor } from "./ScaleFactorSelector";
import { useControlsTimeout } from "./useControlsTimeout";
import { initializeProgress } from "./utils/progressUtils";
import { type AspectRatio } from "./VideoScalingModeSelector";
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
  const [settings] = useSettings();
  const router = useRouter();
  const lightHapticFeedback = useHaptic("light");

  // Local state
  const [episodeView, setEpisodeView] = useState(false);
  const [showAudioSlider, setShowAudioSlider] = useState(false);

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();

  // Initialize progress values
  const min = useSharedValue(0);
  const max = useSharedValue(item.RunTimeTicks || 0);

  // Animated opacity for smooth transitions
  const controlsOpacity = useSharedValue(showControls ? 1 : 0);

  // Trickplay
  const { trickPlayUrl, trickplayInfo, prefetchAllTrickplayImages } =
    useTrickplay(item);

  // Initialize progress on item change
  useEffect(() => {
    if (item) {
      const { initialProgress, maxProgress } = initializeProgress(item, isVlc);
      progress.value = initialProgress;
      max.value = maxProgress;
    }
  }, [item, isVlc, progress, max]);

  // Prefetch trickplay images
  useEffect(() => {
    prefetchAllTrickplayImages();
  }, [prefetchAllTrickplayImages]);

  // Animate controls opacity
  useEffect(() => {
    controlsOpacity.value = withTiming(showControls ? 1 : 0, {
      duration: ANIMATION_DURATION.CONTROLS_FADE,
    });
  }, [showControls, controlsOpacity]);

  // Animated styles
  const animatedControlsStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
  }));

  const animatedOverlayStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value * 0.75,
  }));

  // Extracted hooks
  const { currentTime, remainingTime, getEndTime } = useTimeManagement({
    progress,
    max,
    isSeeking,
    isVlc,
  });

  const {
    isSliding,
    time,
    sliderScale,
    handleSliderStart,
    handleTouchStart,
    handleTouchEnd,
    handleSliderComplete,
    handleSliderChange,
  } = useSliderInteractions({
    progress,
    isSeeking,
    isPlaying,
    isVlc,
    showControls,
    item,
    seek,
    play,
    pause,
  });

  const {
    previousItem,
    nextItem,
    goToItemCommon,
    goToPreviousItem,
    handleNextEpisodeAutoPlay,
    handleNextEpisodeManual,
    handleContinueWatching,
  } = useEpisodeNavigation({
    item,
    offline,
    mediaSource,
  });

  const { handleAspectRatioChange, handleScaleFactorChange } = useVideoScaling({
    setAspectRatio,
    setScaleFactor,
    setVideoAspectRatio,
    setVideoScaleFactor,
  });

  const { handleSkipBackward, handleSkipForward } = useSkipControls({
    progress,
    isPlaying,
    isVlc,
    seek,
    play,
  });

  // Helper functions
  const toggleControls = useCallback(() => {
    if (showControls) {
      setShowAudioSlider(false);
      setShowControls(false);
    } else {
      setShowControls(true);
    }
  }, [showControls, setShowControls]);

  const { showRemoteBubble, time: remoteTime } = useRemoteControls({
    progress,
    min,
    max,
    isVlc,
    showControls,
    isPlaying,
    item,
    seek,
    play,
    togglePlay,
    toggleControls,
  });

  // Skip intro/credits
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

  // Controls timeout
  const hideControls = useCallback(() => {
    setShowControls(false);
    setShowAudioSlider(false);
  }, [setShowControls]);

  const { handleControlsInteraction } = useControlsTimeout({
    showControls,
    isSliding,
    episodeView,
    onHideControls: hideControls,
    timeout: CONTROLS_TIMEOUT,
  });

  // Effective progress calculation
  const effectiveProgress = useSharedValue(0);

  // For remote scrubbing, we'll need to adapt this - for now using the basic progress
  useAnimatedReaction(
    () => progress.value,
    (value) => {
      effectiveProgress.value = value;
    },
    [],
  );

  // Animated style for slider scale
  const animatedSliderStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: sliderScale.value }],
  }));

  const switchOnEpisodeMode = useCallback(() => {
    setEpisodeView(true);
    if (isPlaying) {
      togglePlay();
    }
  }, [isPlaying, togglePlay]);

  const onClose = useCallback(async () => {
    lightHapticFeedback();
    router.back();
  }, [lightHapticFeedback, router]);

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

          <TopControlsBar
            item={item}
            mediaSource={mediaSource}
            offline={offline}
            showControls={showControls}
            aspectRatio={aspectRatio}
            scaleFactor={scaleFactor}
            previousItem={previousItem || undefined}
            nextItem={nextItem || undefined}
            animatedControlsStyle={animatedControlsStyle}
            screenWidth={screenWidth}
            getAudioTracks={getAudioTracks}
            getSubtitleTracks={getSubtitleTracks}
            setSubtitleURL={setSubtitleURL}
            setSubtitleTrack={setSubtitleTrack}
            setAudioTrack={setAudioTrack}
            setVideoAspectRatio={setVideoAspectRatio}
            setVideoScaleFactor={setVideoScaleFactor}
            startPictureInPicture={startPictureInPicture}
            onAspectRatioChange={handleAspectRatioChange}
            onScaleFactorChange={handleScaleFactorChange}
            onEpisodeModeToggle={switchOnEpisodeMode}
            onGoToPreviousItem={goToPreviousItem}
            onGoToNextItem={() => handleNextEpisodeManual()}
            onClose={onClose}
          />

          <CenterControls
            showControls={showControls}
            showAudioSlider={showAudioSlider}
            isPlaying={isPlaying}
            isBuffering={isBuffering}
            rewindSkipTime={settings?.rewindSkipTime}
            forwardSkipTime={settings?.forwardSkipTime}
            animatedControlsStyle={animatedControlsStyle}
            setShowAudioSlider={setShowAudioSlider}
            onTogglePlay={togglePlay}
            onSkipBackward={handleSkipBackward}
            onSkipForward={handleSkipForward}
          />

          <BottomControls
            item={item}
            showControls={showControls}
            isSliding={isSliding}
            showRemoteBubble={showRemoteBubble}
            currentTime={currentTime}
            remainingTime={remainingTime}
            isVlc={isVlc}
            nextItem={nextItem || undefined}
            showSkipButton={showSkipButton}
            showSkipCreditButton={showSkipCreditButton}
            cacheProgress={cacheProgress}
            min={min}
            max={max}
            effectiveProgress={effectiveProgress}
            animatedControlsStyle={animatedControlsStyle}
            animatedSliderStyle={animatedSliderStyle}
            trickPlayUrl={trickPlayUrl || undefined}
            trickplayInfo={trickplayInfo || undefined}
            time={remoteTime || time}
            getEndTime={getEndTime}
            onControlsInteraction={handleControlsInteraction}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onSliderStart={handleSliderStart}
            onSliderComplete={handleSliderComplete}
            onSliderChange={handleSliderChange}
            onSkipIntro={skipIntro}
            onSkipCredit={skipCredit}
            onNextEpisodeAutoPlay={handleNextEpisodeAutoPlay}
            onNextEpisodeManual={handleNextEpisodeManual}
          />
        </>
      )}
      {settings.maxAutoPlayEpisodeCount.value !== -1 && (
        <ContinueWatchingOverlay goToNextItem={handleContinueWatching} />
      )}
    </ControlProvider>
  );
};
