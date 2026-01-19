import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { BlurView } from "expo-blur";
import { type FC, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

export interface TVNextEpisodeCountdownProps {
  nextItem: BaseItemDto;
  api: Api | null;
  show: boolean;
  isPlaying: boolean;
  onFinish: () => void;
}

export const TVNextEpisodeCountdown: FC<TVNextEpisodeCountdownProps> = ({
  nextItem,
  api,
  show,
  isPlaying,
  onFinish,
}) => {
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
    <View style={styles.container} pointerEvents='none'>
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
    </View>
  );
};

const styles = StyleSheet.create({
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
    fontSize: TVTypography.callout,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  seriesName: {
    fontSize: TVTypography.callout,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 2,
  },
  episodeInfo: {
    fontSize: TVTypography.body,
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
