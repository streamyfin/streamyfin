import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { BlurView } from "expo-blur";
import { type FC, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Image,
  Pressable,
  Animated as RNAnimated,
  type View as RNView,
  StyleSheet,
  TVFocusGuideView,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVNextEpisodeCountdownProps {
  nextItem: BaseItemDto;
  api: Api | null;
  show: boolean;
  isPlaying: boolean;
  onFinish: () => void;
  /** Called when user presses the card to skip to next episode */
  onPlayNext?: () => void;
  /** Whether controls are visible - affects card position */
  controlsVisible?: boolean;
  /** Callback ref setter for focus guide destination pattern */
  refSetter?: (ref: RNView | null) => void;
  /** Whether this component should receive initial focus */
  hasTVPreferredFocus?: boolean;
  /** Destination used when moving down from this card */
  playButtonRef?: RNView | null;
}

// Position constants
const BOTTOM_WITH_CONTROLS = 300;
const BOTTOM_WITHOUT_CONTROLS = 120;

export const TVNextEpisodeCountdown: FC<TVNextEpisodeCountdownProps> = ({
  nextItem,
  api,
  show,
  isPlaying,
  onFinish,
  onPlayNext,
  controlsVisible = false,
  refSetter,
  hasTVPreferredFocus = true,
  playButtonRef: downDestination,
}) => {
  const typography = useScaledTVTypography();
  const { t } = useTranslation();
  const progress = useSharedValue(0);
  const onFinishRef = useRef(onFinish);
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({
      scaleAmount: 1.05,
      duration: 120,
    });

  onFinishRef.current = onFinish;

  const imageUrl = getPrimaryImageUrl({
    api,
    item: nextItem,
    width: 360,
    quality: 80,
  });

  // Animated position based on controls visibility
  const bottomPosition = useSharedValue(
    controlsVisible ? BOTTOM_WITH_CONTROLS : BOTTOM_WITHOUT_CONTROLS,
  );

  useEffect(() => {
    const target = controlsVisible
      ? BOTTOM_WITH_CONTROLS
      : BOTTOM_WITHOUT_CONTROLS;
    bottomPosition.value = withTiming(target, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    });
  }, [controlsVisible, bottomPosition]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    bottom: bottomPosition.value,
  }));

  // Progress animation - pause/resume without resetting
  const prevShowRef = useRef(false);

  useEffect(() => {
    const justStartedShowing = show && !prevShowRef.current;
    prevShowRef.current = show;

    if (!show) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    if (justStartedShowing) {
      progress.value = 0;
    }

    if (!isPlaying) {
      cancelAnimation(progress);
      return;
    }

    // Resume from current position
    const remainingDuration = (1 - progress.value) * 8000;
    progress.value = withTiming(
      1,
      { duration: remainingDuration, easing: Easing.linear },
      (finished) => {
        if (finished) {
          runOnJS(onFinishRef.current)();
        }
      },
    );
  }, [show, isPlaying, progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const styles = useMemo(() => createStyles(typography), [typography]);

  if (!show) return null;

  return (
    <Animated.View
      style={[styles.container, containerAnimatedStyle]}
      pointerEvents='box-none'
    >
      <Pressable
        ref={refSetter}
        onPress={onPlayNext}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={hasTVPreferredFocus}
        focusable={true}
      >
        <RNAnimated.View style={[animatedStyle, focused && styles.focusedCard]}>
          <BlurView intensity={80} tint='dark' style={styles.blur}>
            <View style={styles.innerContainer}>
              {imageUrl && (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.thumbnail}
                  resizeMode='cover'
                />
              )}

              <View style={styles.content}>
                <Text style={styles.label}>{t("player.next_episode")}</Text>

                <Text style={styles.seriesName} numberOfLines={1}>
                  {nextItem.SeriesName}
                </Text>

                <Text style={styles.episodeInfo} numberOfLines={1}>
                  S{nextItem.ParentIndexNumber}E{nextItem.IndexNumber} -{" "}
                  {nextItem.Name}
                </Text>

                <View style={styles.progressContainer}>
                  <Animated.View style={[styles.progressBar, progressStyle]} />
                </View>
              </View>
            </View>
          </BlurView>
        </RNAnimated.View>
      </Pressable>
      {downDestination && (
        <TVFocusGuideView
          destinations={[downDestination]}
          style={styles.returnFocusGuide}
        />
      )}
    </Animated.View>
  );
};

const createStyles = (typography: ReturnType<typeof useScaledTVTypography>) =>
  StyleSheet.create({
    container: {
      position: "absolute",
      right: scaleSize(80),
      zIndex: 100,
    },
    focusedCard: {
      shadowColor: "#fff",
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: scaleSize(16),
    },
    blur: {
      borderRadius: scaleSize(16),
      overflow: "hidden",
    },
    innerContainer: {
      flexDirection: "row",
      alignItems: "stretch",
    },
    thumbnail: {
      width: scaleSize(180),
      backgroundColor: "rgba(0,0,0,0.3)",
    },
    content: {
      padding: scaleSize(16),
      justifyContent: "center",
      width: scaleSize(280),
    },
    label: {
      fontSize: typography.callout,
      color: "rgba(255,255,255,0.5)",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: scaleSize(4),
    },
    seriesName: {
      fontSize: typography.callout,
      color: "rgba(255,255,255,0.7)",
      marginBottom: scaleSize(2),
    },
    episodeInfo: {
      fontSize: typography.body,
      color: "#fff",
      fontWeight: "600",
      marginBottom: scaleSize(12),
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
    returnFocusGuide: {
      height: 1,
      width: "100%",
    },
  });
