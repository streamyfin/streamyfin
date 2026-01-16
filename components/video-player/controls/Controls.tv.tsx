import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { BlurView } from "expo-blur";
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
  Animated as RNAnimated,
  Easing as RNEasing,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
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
import { useTrickplay } from "@/hooks/useTrickplay";
import { formatTimeString, ticksToMs } from "@/utils/time";
import { CONTROLS_CONSTANTS } from "./constants";
import { useRemoteControl } from "./hooks/useRemoteControl";
import { useVideoSlider } from "./hooks/useVideoSlider";
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
}

const TV_SEEKBAR_HEIGHT = 16;
const TV_AUTO_HIDE_TIMEOUT = 5000;

// Option item type for TV selector
type TVOptionItem<T> = {
  label: string;
  value: T;
  selected: boolean;
};

// TV Option Selector - Bottom sheet with horizontal scrolling
const TVOptionSelector = <T,>({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: TVOptionItem<T>[];
  onSelect: (value: T) => void;
  onClose: () => void;
}) => {
  const initialSelectedIndex = useMemo(() => {
    const idx = options.findIndex((o) => o.selected);
    return idx >= 0 ? idx : 0;
  }, [options]);

  if (!visible) return null;

  return (
    <View style={selectorStyles.overlay}>
      <BlurView intensity={80} tint='dark' style={selectorStyles.blurContainer}>
        <View style={selectorStyles.content}>
          <Text style={selectorStyles.title}>{title}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={selectorStyles.scrollView}
            contentContainerStyle={selectorStyles.scrollContent}
          >
            {options.map((option, index) => (
              <TVOptionCard
                key={index}
                label={option.label}
                selected={option.selected}
                hasTVPreferredFocus={index === initialSelectedIndex}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
              />
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </View>
  );
};

// Option card for horizontal selector
const TVOptionCard: FC<{
  label: string;
  selected: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}> = ({ label, selected, hasTVPreferredFocus, onPress }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new RNAnimated.Value(1)).current;

  const animateTo = (v: number) =>
    RNAnimated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <RNAnimated.View
        style={[
          selectorStyles.card,
          {
            transform: [{ scale }],
            backgroundColor: focused
              ? "#fff"
              : selected
                ? "rgba(255,255,255,0.2)"
                : "rgba(255,255,255,0.08)",
          },
        ]}
      >
        <Text
          style={[
            selectorStyles.cardText,
            { color: focused ? "#000" : "#fff" },
            (focused || selected) && { fontWeight: "600" },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {selected && !focused && (
          <View style={selectorStyles.checkmark}>
            <Ionicons
              name='checkmark'
              size={16}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
      </RNAnimated.View>
    </Pressable>
  );
};

// Settings panel with tabs for Audio and Subtitles
const TVSettingsPanel: FC<{
  visible: boolean;
  audioOptions: TVOptionItem<number>[];
  subtitleOptions: TVOptionItem<number>[];
  onAudioSelect: (value: number) => void;
  onSubtitleSelect: (value: number) => void;
  onClose: () => void;
  t: (key: string) => string;
}> = ({
  visible,
  audioOptions,
  subtitleOptions,
  onAudioSelect,
  onSubtitleSelect,
  onClose,
  t,
}) => {
  const [activeTab, setActiveTab] = useState<"audio" | "subtitle">("audio");

  const currentOptions = activeTab === "audio" ? audioOptions : subtitleOptions;
  const currentOnSelect =
    activeTab === "audio" ? onAudioSelect : onSubtitleSelect;

  const initialSelectedIndex = useMemo(() => {
    const idx = currentOptions.findIndex((o) => o.selected);
    return idx >= 0 ? idx : 0;
  }, [currentOptions]);

  if (!visible) return null;

  return (
    <View style={selectorStyles.overlay}>
      <BlurView intensity={80} tint='dark' style={selectorStyles.blurContainer}>
        <View style={selectorStyles.content}>
          {/* Tab buttons - switch automatically on focus */}
          <View style={selectorStyles.tabRow}>
            {audioOptions.length > 0 && (
              <TVSettingsTab
                label={t("item_card.audio")}
                active={activeTab === "audio"}
                onSelect={() => setActiveTab("audio")}
              />
            )}
            {subtitleOptions.length > 0 && (
              <TVSettingsTab
                label={t("item_card.subtitles")}
                active={activeTab === "subtitle"}
                onSelect={() => setActiveTab("subtitle")}
              />
            )}
          </View>

          {/* Options - first selected option gets preferred focus */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={selectorStyles.scrollView}
            contentContainerStyle={selectorStyles.scrollContent}
          >
            {currentOptions.map((option, index) => (
              <TVOptionCard
                key={`${activeTab}-${index}`}
                label={option.label}
                selected={option.selected}
                hasTVPreferredFocus={index === initialSelectedIndex}
                onPress={() => {
                  currentOnSelect(option.value);
                  onClose();
                }}
              />
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </View>
  );
};

// Tab button for settings panel - switches on focus, no click needed
const TVSettingsTab: FC<{
  label: string;
  active: boolean;
  onSelect: () => void;
  hasTVPreferredFocus?: boolean;
}> = ({ label, active, onSelect, hasTVPreferredFocus }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new RNAnimated.Value(1)).current;

  const animateTo = (v: number) =>
    RNAnimated.timing(scale, {
      toValue: v,
      duration: 120,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
        // Switch tab automatically on focus
        onSelect();
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <RNAnimated.View
        style={[
          selectorStyles.tabButton,
          {
            transform: [{ scale }],
            backgroundColor: focused
              ? "#fff"
              : active
                ? "rgba(255,255,255,0.2)"
                : "transparent",
            borderBottomColor: active ? "#fff" : "transparent",
          },
        ]}
      >
        <Text
          style={[
            selectorStyles.tabText,
            { color: focused ? "#000" : "#fff" },
            (focused || active) && { fontWeight: "600" },
          ]}
        >
          {label}
        </Text>
      </RNAnimated.View>
    </Pressable>
  );
};

// Button to open option selector (kept for potential future use)
const _TVControlButton: FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  onFocusChange?: (focused: boolean) => void;
}> = ({ icon, label, onPress, disabled, onFocusChange }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new RNAnimated.Value(1)).current;

  const animateTo = (v: number) =>
    RNAnimated.timing(scale, {
      toValue: v,
      duration: 120,
      easing: RNEasing.out(RNEasing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.08);
        onFocusChange?.(true);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
        onFocusChange?.(false);
      }}
      disabled={disabled}
      focusable={!disabled}
    >
      <RNAnimated.View
        style={[
          selectorStyles.controlButton,
          {
            transform: [{ scale }],
            backgroundColor: focused
              ? "rgba(255,255,255,0.25)"
              : "rgba(255,255,255,0.15)",
            borderColor: focused ? "rgba(255,255,255,0.6)" : "transparent",
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color='#fff'
          style={{ marginRight: 6 }}
        />
        <Text
          style={[
            selectorStyles.controlButtonText,
            { color: "#fff", fontWeight: focused ? "600" : "500" },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </RNAnimated.View>
    </Pressable>
  );
};

const selectorStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  blurContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  content: {
    paddingTop: 24,
    paddingBottom: 50,
    overflow: "visible",
  },
  title: {
    fontSize: 18,
    fontWeight: "500",
    color: "rgba(255,255,255,0.6)",
    marginBottom: 16,
    paddingHorizontal: 48,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  scrollView: {
    overflow: "visible",
  },
  scrollContent: {
    paddingHorizontal: 48,
    paddingVertical: 10,
    gap: 12,
  },
  card: {
    width: 180,
    height: 80,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  cardText: {
    fontSize: 16,
    textAlign: "center",
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  controlButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 48,
    marginBottom: 16,
    gap: 24,
  },
  tabButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 18,
  },
});

export const Controls: FC<Props> = ({
  item,
  seek,
  play,
  pause,
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
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  // Modal state for option selectors
  // "settings" shows the settings panel, "audio"/"subtitle" for direct selection
  type ModalType = "settings" | "audio" | "subtitle" | null;
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const isModalOpen = openModal !== null;

  // Handle swipe down to open settings panel
  const handleSwipeDown = useCallback(() => {
    if (!isModalOpen) {
      setOpenModal("settings");
    }
  }, [isModalOpen]);

  // Get available audio tracks
  const audioTracks = useMemo(() => {
    return mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") ?? [];
  }, [mediaSource]);

  // Get available subtitle tracks
  const subtitleTracks = useMemo(() => {
    return (
      mediaSource?.MediaStreams?.filter((s) => s.Type === "Subtitle") ?? []
    );
  }, [mediaSource]);

  // Audio options for selector
  const audioOptions = useMemo(() => {
    return audioTracks.map((track) => ({
      label:
        track.DisplayTitle || `${track.Language || "Unknown"} (${track.Codec})`,
      value: track.Index!,
      selected: track.Index === audioIndex,
    }));
  }, [audioTracks, audioIndex]);

  // Subtitle options for selector (with "None" option)
  const subtitleOptions = useMemo(() => {
    const noneOption = {
      label: t("item_card.subtitles.none"),
      value: -1,
      selected: subtitleIndex === -1,
    };
    const trackOptions = subtitleTracks.map((track) => ({
      label:
        track.DisplayTitle || `${track.Language || "Unknown"} (${track.Codec})`,
      value: track.Index!,
      selected: track.Index === subtitleIndex,
    }));
    return [noneOption, ...trackOptions];
  }, [subtitleTracks, subtitleIndex, t]);

  // Get display labels for buttons
  const _selectedAudioLabel = useMemo(() => {
    const track = audioTracks.find((t) => t.Index === audioIndex);
    return track?.DisplayTitle || track?.Language || t("item_card.audio");
  }, [audioTracks, audioIndex, t]);

  const _selectedSubtitleLabel = useMemo(() => {
    if (subtitleIndex === -1) return t("item_card.subtitles.none");
    const track = subtitleTracks.find((t) => t.Index === subtitleIndex);
    return track?.DisplayTitle || track?.Language || t("item_card.subtitles");
  }, [subtitleTracks, subtitleIndex, t]);

  // Handlers for option changes
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

  // Animation values for controls
  const controlsOpacity = useSharedValue(showControls ? 1 : 0);
  const bottomTranslateY = useSharedValue(showControls ? 0 : 50);

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, [prefetchAllTrickplayImages]);

  // Animate controls visibility
  useEffect(() => {
    const animationConfig = {
      duration: 300,
      easing: Easing.out(Easing.quad),
    };

    controlsOpacity.value = withTiming(showControls ? 1 : 0, animationConfig);
    bottomTranslateY.value = withTiming(showControls ? 0 : 30, animationConfig);
  }, [showControls, controlsOpacity, bottomTranslateY]);

  // Create animated style for bottom controls
  const bottomAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: bottomTranslateY.value }],
  }));

  // Initialize progress values
  useEffect(() => {
    if (item) {
      progress.value = ticksToMs(item?.UserData?.PlaybackPositionTicks);
      max.value = ticksToMs(item.RunTimeTicks || 0);
    }
  }, [item, progress, max]);

  // Time management hook
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

  // Long press seek handlers for continuous seeking
  const handleSeekForward = useCallback(
    (seconds: number) => {
      const newPosition = Math.min(max.value, progress.value + seconds * 1000);
      progress.value = newPosition;
      seek(newPosition);
    },
    [progress, max, seek],
  );

  const handleSeekBackward = useCallback(
    (seconds: number) => {
      const newPosition = Math.max(min.value, progress.value - seconds * 1000);
      progress.value = newPosition;
      seek(newPosition);
    },
    [progress, min, seek],
  );

  // Remote control hook for TV navigation
  const {
    remoteScrubProgress,
    isRemoteScrubbing,
    showRemoteBubble,
    isSliding: isRemoteSliding,
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
    disableSeeking: isModalOpen,
    onSwipeDown: handleSwipeDown,
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

  // Recompute progress for remote scrubbing
  useAnimatedReaction(
    () => ({
      isScrubbing: isRemoteScrubbing.value,
      scrub: remoteScrubProgress.value,
      actual: progress.value,
    }),
    (current, previous) => {
      if (
        current.isScrubbing !== previous?.isScrubbing ||
        current.isScrubbing
      ) {
        effectiveProgress.value =
          current.isScrubbing && current.scrub != null
            ? current.scrub
            : current.actual;
      } else {
        const progressUnit = CONTROLS_CONSTANTS.PROGRESS_UNIT_MS;
        const progressDiff = Math.abs(current.actual - effectiveProgress.value);
        if (progressDiff >= progressUnit) {
          effectiveProgress.value = current.actual;
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
    isSliding: isSliding || isRemoteSliding,
    episodeView: false,
    onHideControls: hideControls,
    timeout: TV_AUTO_HIDE_TIMEOUT,
    disabled: false,
  });

  // Check if we have any settings to show
  const hasSettings =
    audioTracks.length > 0 ||
    subtitleTracks.length > 0 ||
    subtitleIndex !== undefined;

  return (
    <View style={styles.controlsContainer} pointerEvents='box-none'>
      {/* Center Play Button - shown when paused */}
      {!isPlaying && showControls && (
        <View style={styles.centerContainer}>
          <BlurView intensity={40} tint='dark' style={styles.playButtonBlur}>
            <View style={styles.playButtonInner}>
              <Ionicons
                name='play'
                size={44}
                color='white'
                style={styles.playIcon}
              />
            </View>
          </BlurView>
        </View>
      )}

      {/* Top hint - swipe up for settings */}
      {showControls && hasSettings && !isModalOpen && (
        <Animated.View
          style={[styles.topContainer, bottomAnimatedStyle]}
          pointerEvents='none'
        >
          <View
            style={[
              styles.topInner,
              {
                paddingRight: Math.max(insets.right, 48),
                paddingLeft: Math.max(insets.left, 48),
                paddingTop: Math.max(insets.top, 48),
              },
            ]}
          >
            <View style={styles.settingsHint}>
              <Text style={styles.settingsHintText}>
                {t("player.swipe_down_settings")}
              </Text>
              <Ionicons
                name='chevron-down'
                size={16}
                color='rgba(255,255,255,0.5)'
              />
            </View>
          </View>
        </Animated.View>
      )}

      <Animated.View
        style={[styles.bottomContainer, bottomAnimatedStyle]}
        pointerEvents={showControls && !isModalOpen ? "auto" : "none"}
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
          {/* Metadata */}
          <View style={styles.metadataContainer}>
            {item?.Type === "Episode" && (
              <Text style={styles.subtitleText}>
                {`${item.SeriesName} - ${item.SeasonName} Episode ${item.IndexNumber}`}
              </Text>
            )}
            <Text style={styles.titleText}>{item?.Name}</Text>
            {item?.Type === "Movie" && (
              <Text style={styles.subtitleText}>{item?.ProductionYear}</Text>
            )}
          </View>

          {/* Large Seekbar */}
          <View
            style={styles.sliderContainer}
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
              containerStyle={styles.sliderTrack}
              renderBubble={() =>
                (isSliding || showRemoteBubble) && (
                  <TrickplayBubble
                    trickPlayUrl={trickPlayUrl}
                    trickplayInfo={trickplayInfo}
                    time={time}
                  />
                )
              }
              sliderHeight={TV_SEEKBAR_HEIGHT}
              thumbWidth={0}
              progress={effectiveProgress}
              minimumValue={min}
              maximumValue={max}
            />
          </View>

          {/* Time Display */}
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

      {/* Settings panel - shows audio and subtitle options */}
      <TVSettingsPanel
        visible={openModal === "settings"}
        audioOptions={audioOptions}
        subtitleOptions={subtitleOptions}
        onAudioSelect={handleAudioChange}
        onSubtitleSelect={handleSubtitleChange}
        onClose={() => setOpenModal(null)}
        t={t}
      />

      {/* Direct option selector modals (for future use) */}
      <TVOptionSelector
        visible={openModal === "audio"}
        title={t("item_card.audio")}
        options={audioOptions}
        onSelect={handleAudioChange}
        onClose={() => setOpenModal(null)}
      />

      <TVOptionSelector
        visible={openModal === "subtitle"}
        title={t("item_card.subtitles")}
        options={subtitleOptions}
        onSelect={handleSubtitleChange}
        onClose={() => setOpenModal(null)}
      />
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
  centerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  playButtonBlur: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
  },
  playButtonInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 40,
  },
  playIcon: {
    marginLeft: 4,
  },
  topContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topInner: {
    flexDirection: "row",
    justifyContent: "center",
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
  sliderContainer: {
    height: TV_SEEKBAR_HEIGHT,
    justifyContent: "center",
    alignItems: "stretch",
  },
  sliderTrack: {
    borderRadius: 100,
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
  settingsRow: {
    flexDirection: "row",
    gap: 12,
  },
  settingsHint: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  settingsHintText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },
});
