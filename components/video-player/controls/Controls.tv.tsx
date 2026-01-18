import { Ionicons } from "@expo/vector-icons";
import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { BlurView } from "expo-blur";
import { useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import React, {
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  BackHandler,
  Image,
  Platform,
  Pressable,
  Animated as RNAnimated,
  Easing as RNEasing,
  ScrollView,
  StyleSheet,
  TVFocusGuideView,
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
import { TVSubtitleSheet } from "@/components/common/TVSubtitleSheet";
import useRouter from "@/hooks/useAppRouter";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useTrickplay } from "@/hooks/useTrickplay";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
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
  /** Called when a subtitle is downloaded to the server (re-fetch media source needed) */
  onServerSubtitleDownloaded?: () => void;
  /** Add a local subtitle file to the player */
  addSubtitleFile?: (path: string) => void;
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
  const [isReady, setIsReady] = useState(false);
  const firstCardRef = useRef<View>(null);

  // Animation values
  const overlayOpacity = useRef(new RNAnimated.Value(0)).current;
  const sheetTranslateY = useRef(new RNAnimated.Value(200)).current;

  const initialSelectedIndex = useMemo(() => {
    const idx = options.findIndex((o) => o.selected);
    return idx >= 0 ? idx : 0;
  }, [options]);

  // Animate in when visible
  useEffect(() => {
    if (visible) {
      // Reset values and animate in
      overlayOpacity.setValue(0);
      sheetTranslateY.setValue(200);

      RNAnimated.parallel([
        RNAnimated.timing(overlayOpacity, {
          toValue: 1,
          duration: 250,
          easing: RNEasing.out(RNEasing.quad),
          useNativeDriver: true,
        }),
        RNAnimated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 300,
          easing: RNEasing.out(RNEasing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, overlayOpacity, sheetTranslateY]);

  // Delay rendering to work around hasTVPreferredFocus timing issue
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setIsReady(true), 100);
      return () => clearTimeout(timer);
    }
    setIsReady(false);
  }, [visible]);

  // Programmatic focus fallback
  useEffect(() => {
    if (isReady && firstCardRef.current) {
      const timer = setTimeout(() => {
        (firstCardRef.current as any)?.requestTVFocus?.();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isReady]);

  if (!visible) return null;

  return (
    <RNAnimated.View
      style={[selectorStyles.overlay, { opacity: overlayOpacity }]}
    >
      <RNAnimated.View
        style={[
          selectorStyles.sheetContainer,
          { transform: [{ translateY: sheetTranslateY }] },
        ]}
      >
        <BlurView
          intensity={80}
          tint='dark'
          style={selectorStyles.blurContainer}
        >
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={selectorStyles.content}
          >
            <Text style={selectorStyles.title}>{title}</Text>
            {isReady && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={selectorStyles.scrollView}
                contentContainerStyle={selectorStyles.scrollContent}
              >
                {options.map((option, index) => (
                  <TVOptionCard
                    key={index}
                    ref={
                      index === initialSelectedIndex ? firstCardRef : undefined
                    }
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
            )}
          </TVFocusGuideView>
        </BlurView>
      </RNAnimated.View>
    </RNAnimated.View>
  );
};

// Option card for horizontal selector (with forwardRef for programmatic focus)
const TVOptionCard = React.forwardRef<
  View,
  {
    label: string;
    selected: boolean;
    hasTVPreferredFocus?: boolean;
    onPress: () => void;
  }
>(({ label, selected, hasTVPreferredFocus, onPress }, ref) => {
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
      ref={ref}
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
});

// Settings panel with tabs for Audio and Subtitles
const _TVSettingsPanel: FC<{
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
                label={t("item_card.subtitles.label")}
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
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={delayLongPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.15);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      disabled={disabled}
      focusable={!disabled}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
    >
      <RNAnimated.View
        style={[
          controlButtonStyles.button,
          {
            transform: [{ scale }],
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
  sheetContainer: {
    // Container for the sheet to enable slide animation
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

  // Keep onFinish ref updated
  onFinishRef.current = onFinish;

  // Get episode thumbnail
  const imageUrl = getPrimaryImageUrl({
    api,
    item: nextItem,
    width: 360, // 2x for retina
    quality: 80,
  });

  // Handle animation based on show and isPlaying state
  useEffect(() => {
    if (show && isPlaying) {
      // Start/restart animation from beginning
      progress.value = 0;
      progress.value = withTiming(
        1,
        {
          duration: 8000, // 8 seconds (ends 2 seconds before episode end)
          easing: Easing.linear,
        },
        (finished) => {
          if (finished && onFinishRef.current) {
            runOnJS(onFinishRef.current)();
          }
        },
      );
    } else {
      // Pause: cancel animation and reset progress
      cancelAnimation(progress);
      progress.value = 0;
    }
  }, [show, isPlaying, progress]);

  // Animated style for progress bar
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  if (!show) return null;

  return (
    <View style={countdownStyles.container} pointerEvents='none'>
      <BlurView intensity={80} tint='dark' style={countdownStyles.blur}>
        <View style={countdownStyles.innerContainer}>
          {/* Episode Thumbnail - left side */}
          {imageUrl && (
            <Image
              source={{ uri: imageUrl }}
              style={countdownStyles.thumbnail}
              resizeMode='cover'
            />
          )}

          {/* Content - right side */}
          <View style={countdownStyles.content}>
            {/* Label: "Next Episode" */}
            <Text style={countdownStyles.label}>
              {t("player.next_episode")}
            </Text>

            {/* Series Name */}
            <Text style={countdownStyles.seriesName} numberOfLines={1}>
              {nextItem.SeriesName}
            </Text>

            {/* Episode Info: S#E# - Episode Name */}
            <Text style={countdownStyles.episodeInfo} numberOfLines={1}>
              S{nextItem.ParentIndexNumber}E{nextItem.IndexNumber} -{" "}
              {nextItem.Name}
            </Text>

            {/* Progress Bar */}
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

  // TV is always online
  const { nextItem: internalNextItem } = usePlaybackManager({
    item,
    isOffline: false,
  });

  // Use props if provided, otherwise use internal state
  const nextItem = nextItemProp ?? internalNextItem;

  // Modal state for option selectors
  type ModalType = "audio" | "subtitle" | null;
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const isModalOpen = openModal !== null;

  // Track which button last opened a modal (for returning focus)
  const [lastOpenedModal, setLastOpenedModal] = useState<ModalType>(null);

  // Android TV BackHandler for closing modals
  useEffect(() => {
    if (Platform.OS === "android" && isModalOpen) {
      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          setOpenModal(null);
          return true;
        },
      );
      return () => backHandler.remove();
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

  // Get display labels for buttons
  const _selectedAudioLabel = useMemo(() => {
    const track = audioTracks.find((t) => t.Index === audioIndex);
    return track?.DisplayTitle || track?.Language || t("item_card.audio");
  }, [audioTracks, audioIndex, t]);

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

  // Trickplay bubble state for seek buttons
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

  // Update trickplay time from ms
  const updateSeekBubbleTime = useCallback((ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    setSeekBubbleTime({ hours, minutes, seconds });
  }, []);

  // Handler for back button to close modals
  const handleBack = useCallback(() => {
    if (isModalOpen) {
      setOpenModal(null);
    }
  }, [isModalOpen]);

  // Remote control hook for TV navigation (simplified - D-pad navigates buttons now)
  const { isSliding: isRemoteSliding } = useRemoteControl({
    showControls,
    toggleControls,
    togglePlay,
    onBack: handleBack,
  });

  // Handlers for opening audio/subtitle sheets
  const handleOpenAudioSheet = useCallback(() => {
    setLastOpenedModal("audio");
    setOpenModal("audio");
    controlsInteractionRef.current();
  }, []);

  const handleOpenSubtitleSheet = useCallback(() => {
    setLastOpenedModal("subtitle");
    setOpenModal("subtitle");
    controlsInteractionRef.current();
  }, []);

  // Progress value for the progress bar (directly from playback progress)
  const effectiveProgress = useSharedValue(0);

  // Threshold for detecting a seek (5 seconds) vs normal playback
  const SEEK_THRESHOLD_MS = 5000;

  // Update effective progress from playback progress
  useAnimatedReaction(
    () => progress.value,
    (current, _previous) => {
      const progressUnit = CONTROLS_CONSTANTS.PROGRESS_UNIT_MS;
      const progressDiff = Math.abs(current - effectiveProgress.value);
      if (progressDiff >= progressUnit) {
        // Animate large jumps (seeks), instant update for normal playback
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

  // Keep ref updated for seek button handlers
  controlsInteractionRef.current = handleControlsInteraction;

  // Seek button handlers (30 seconds)
  const handleSeekForwardButton = useCallback(() => {
    const newPosition = Math.min(max.value, progress.value + 30 * 1000);
    progress.value = newPosition;
    seek(newPosition);

    // Show trickplay bubble
    calculateTrickplayUrl(msToTicks(newPosition));
    updateSeekBubbleTime(newPosition);
    setShowSeekBubble(true);

    // Hide bubble after delay
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

    // Show trickplay bubble
    calculateTrickplayUrl(msToTicks(newPosition));
    updateSeekBubbleTime(newPosition);
    setShowSeekBubble(true);

    // Hide bubble after delay
    if (seekBubbleTimeoutRef.current) {
      clearTimeout(seekBubbleTimeoutRef.current);
    }
    seekBubbleTimeoutRef.current = setTimeout(() => {
      setShowSeekBubble(false);
    }, 2000);

    controlsInteractionRef.current();
  }, [progress, min, seek, calculateTrickplayUrl, updateSeekBubbleTime]);

  // Stop continuous seeking
  const stopContinuousSeeking = useCallback(() => {
    if (continuousSeekRef.current) {
      clearInterval(continuousSeekRef.current);
      continuousSeekRef.current = null;
    }
    seekAccelerationRef.current = 1;

    // Hide trickplay bubble after delay
    if (seekBubbleTimeoutRef.current) {
      clearTimeout(seekBubbleTimeoutRef.current);
    }
    seekBubbleTimeoutRef.current = setTimeout(() => {
      setShowSeekBubble(false);
    }, 2000);
  }, []);

  // Start continuous seek forward (on long press)
  const startContinuousSeekForward = useCallback(() => {
    seekAccelerationRef.current = 1;

    // Perform immediate first seek
    handleSeekForwardButton();

    // Start interval for continuous seeking with acceleration
    continuousSeekRef.current = setInterval(() => {
      const seekAmount =
        CONTROLS_CONSTANTS.LONG_PRESS_INITIAL_SEEK *
        seekAccelerationRef.current *
        1000;
      const newPosition = Math.min(max.value, progress.value + seekAmount);
      progress.value = newPosition;
      seek(newPosition);

      // Update trickplay bubble
      calculateTrickplayUrl(msToTicks(newPosition));
      updateSeekBubbleTime(newPosition);

      // Accelerate for next interval
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

  // Start continuous seek backward (on long press)
  const startContinuousSeekBackward = useCallback(() => {
    seekAccelerationRef.current = 1;

    // Perform immediate first seek
    handleSeekBackwardButton();

    // Start interval for continuous seeking with acceleration
    continuousSeekRef.current = setInterval(() => {
      const seekAmount =
        CONTROLS_CONSTANTS.LONG_PRESS_INITIAL_SEEK *
        seekAccelerationRef.current *
        1000;
      const newPosition = Math.max(min.value, progress.value - seekAmount);
      progress.value = newPosition;
      seek(newPosition);

      // Update trickplay bubble
      calculateTrickplayUrl(msToTicks(newPosition));
      updateSeekBubbleTime(newPosition);

      // Accelerate for next interval
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

  // Play/Pause button handler
  const handlePlayPauseButton = useCallback(() => {
    togglePlay();
    controlsInteractionRef.current();
  }, [togglePlay]);

  // Previous item handler
  const handlePreviousItem = useCallback(() => {
    if (goToPreviousItem) {
      goToPreviousItem();
    }
    controlsInteractionRef.current();
  }, [goToPreviousItem]);

  // Next item button handler
  const handleNextItemButton = useCallback(() => {
    if (goToNextItemProp) {
      goToNextItemProp();
    } else {
      goToNextItemRef.current({ isAutoPlay: false });
    }
    controlsInteractionRef.current();
  }, [goToNextItemProp]);

  // goToNextItem function for auto-play
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

  // Keep ref updated for button handlers
  goToNextItemRef.current = goToNextItem;

  // Should show countdown? (TV always auto-plays next episode, no episode count limit)
  const shouldShowCountdown = useMemo(() => {
    if (!nextItem) return false;
    if (item?.Type !== "Episode") return false;
    return remainingTime > 0 && remainingTime <= 10000;
  }, [nextItem, item, remainingTime]);

  // Handler for when countdown animation finishes
  const handleAutoPlayFinish = useCallback(() => {
    goToNextItem({ isAutoPlay: true });
  }, [goToNextItem]);

  return (
    <View style={styles.controlsContainer} pointerEvents='box-none'>
      {/* Dark tint overlay when controls are visible */}
      <Animated.View
        style={[styles.darkOverlay, bottomAnimatedStyle]}
        pointerEvents='none'
      />

      {/* Next Episode Countdown - always visible when countdown active */}
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
              <Text
                style={styles.subtitleText}
              >{`${item.SeriesName} - ${item.SeasonName} Episode ${item.IndexNumber}`}</Text>
            )}
            <Text style={styles.titleText}>{item?.Name}</Text>
            {item?.Type === "Movie" && (
              <Text style={styles.subtitleText}>{item?.ProductionYear}</Text>
            )}
          </View>

          {/* Control Buttons Row */}
          <View style={styles.controlButtonsRow}>
            <TVControlButton
              icon='play-skip-back'
              onPress={handlePreviousItem}
              disabled={isModalOpen || !previousItem}
              size={28}
            />
            <TVControlButton
              icon='play-back'
              onPress={handleSeekBackwardButton}
              onLongPress={startContinuousSeekBackward}
              onPressOut={stopContinuousSeeking}
              disabled={isModalOpen}
              size={28}
            />
            <TVControlButton
              icon={isPlaying ? "pause" : "play"}
              onPress={handlePlayPauseButton}
              disabled={isModalOpen}
              hasTVPreferredFocus={!isModalOpen && lastOpenedModal === null}
              size={36}
            />
            <TVControlButton
              icon='play-forward'
              onPress={handleSeekForwardButton}
              onLongPress={startContinuousSeekForward}
              onPressOut={stopContinuousSeeking}
              disabled={isModalOpen}
              size={28}
            />
            <TVControlButton
              icon='play-skip-forward'
              onPress={handleNextItemButton}
              disabled={isModalOpen || !nextItem}
              size={28}
            />

            {/* Spacer to separate settings buttons from transport controls */}
            <View style={styles.controlButtonsSpacer} />

            {/* Audio button - only show when audio tracks are available */}
            {audioOptions.length > 0 && (
              <TVControlButton
                icon='volume-high'
                onPress={handleOpenAudioSheet}
                disabled={isModalOpen}
                hasTVPreferredFocus={
                  !isModalOpen && lastOpenedModal === "audio"
                }
                size={24}
              />
            )}

            {/* Subtitle button - always show to allow search even if no tracks */}
            <TVControlButton
              icon='text'
              onPress={handleOpenSubtitleSheet}
              disabled={isModalOpen}
              hasTVPreferredFocus={
                !isModalOpen && lastOpenedModal === "subtitle"
              }
              size={24}
            />
          </View>

          {/* Trickplay Bubble - shown when seeking */}
          {showSeekBubble && (
            <View style={styles.trickplayBubbleContainer}>
              <TrickplayBubble
                trickPlayUrl={trickPlayUrl}
                trickplayInfo={trickplayInfo}
                time={seekBubbleTime}
              />
            </View>
          )}

          {/* Non-interactive Progress Bar */}
          <View style={styles.progressBarContainer} pointerEvents='none'>
            <View style={styles.progressTrack}>
              {/* Cache progress */}
              <Animated.View
                style={[
                  styles.cacheProgress,
                  useAnimatedStyle(() => ({
                    width: `${max.value > 0 ? (cacheProgress.value / max.value) * 100 : 0}%`,
                  })),
                ]}
              />
              {/* Playback progress */}
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

      {/* Audio option selector */}
      <TVOptionSelector
        visible={openModal === "audio"}
        title={t("item_card.audio")}
        options={audioOptions}
        onSelect={handleAudioChange}
        onClose={() => setOpenModal(null)}
      />

      {/* Subtitle Sheet with tabs for tracks and search */}
      <TVSubtitleSheet
        visible={openModal === "subtitle"}
        item={item}
        mediaSourceId={mediaSource?.Id}
        subtitleTracks={subtitleTracks}
        currentSubtitleIndex={subtitleIndex ?? -1}
        onSubtitleChange={handleSubtitleChange}
        onClose={() => setOpenModal(null)}
        onServerSubtitleDownloaded={onServerSubtitleDownloaded}
        onLocalSubtitleDownloaded={addSubtitleFile}
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
