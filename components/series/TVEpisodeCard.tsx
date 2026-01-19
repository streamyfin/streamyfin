import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { View } from "react-native";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Text } from "@/components/common/Text";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { WatchedIndicator } from "@/components/WatchedIndicator";
import { TVTypography } from "@/constants/TVTypography";
import { apiAtom } from "@/providers/JellyfinProvider";
import { runtimeTicksToMinutes } from "@/utils/time";

export const TV_EPISODE_WIDTH = 340;

interface TVEpisodeCardProps {
  episode: BaseItemDto;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const TVEpisodeCard: React.FC<TVEpisodeCardProps> = ({
  episode,
  hasTVPreferredFocus = false,
  disabled = false,
  onPress,
  onFocus,
  onBlur,
}) => {
  const api = useAtomValue(apiAtom);

  const thumbnailUrl = useMemo(() => {
    if (!api) return null;

    // Try to get episode primary image first
    if (episode.ImageTags?.Primary) {
      return `${api.basePath}/Items/${episode.Id}/Images/Primary?fillHeight=600&quality=80&tag=${episode.ImageTags.Primary}`;
    }

    // Fall back to series thumb or backdrop
    if (episode.ParentBackdropItemId && episode.ParentThumbImageTag) {
      return `${api.basePath}/Items/${episode.ParentBackdropItemId}/Images/Thumb?fillHeight=600&quality=80&tag=${episode.ParentThumbImageTag}`;
    }

    // Default episode image
    return `${api.basePath}/Items/${episode.Id}/Images/Primary?fillHeight=600&quality=80`;
  }, [api, episode]);

  const duration = useMemo(() => {
    if (!episode.RunTimeTicks) return null;
    return runtimeTicksToMinutes(episode.RunTimeTicks);
  }, [episode.RunTimeTicks]);

  const episodeLabel = useMemo(() => {
    const season = episode.ParentIndexNumber;
    const ep = episode.IndexNumber;
    if (season !== undefined && ep !== undefined) {
      return `S${season}:E${ep}`;
    }
    return null;
  }, [episode.ParentIndexNumber, episode.IndexNumber]);

  return (
    <View style={{ width: TV_EPISODE_WIDTH }}>
      <TVFocusablePoster
        onPress={onPress}
        hasTVPreferredFocus={hasTVPreferredFocus}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <View
          style={{
            width: TV_EPISODE_WIDTH,
            aspectRatio: 16 / 9,
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: "#1a1a1a",
          }}
        >
          {thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
              cachePolicy='memory-disk'
            />
          ) : (
            <View
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: "#262626",
              }}
            />
          )}
          <WatchedIndicator item={episode} />
          <ProgressBar item={episode} />
        </View>
      </TVFocusablePoster>

      {/* Episode info below thumbnail */}
      <View style={{ marginTop: 12, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {episodeLabel && (
            <Text
              style={{
                fontSize: TVTypography.callout,
                color: "#9CA3AF",
                fontWeight: "500",
              }}
            >
              {episodeLabel}
            </Text>
          )}
          {duration && (
            <>
              <Text
                style={{ color: "#6B7280", fontSize: TVTypography.callout }}
              >
                •
              </Text>
              <Text
                style={{ fontSize: TVTypography.callout, color: "#9CA3AF" }}
              >
                {duration}
              </Text>
            </>
          )}
        </View>
        <Text
          numberOfLines={2}
          style={{
            fontSize: TVTypography.callout,
            color: "#FFFFFF",
            marginTop: 4,
            fontWeight: "500",
          }}
        >
          {episode.Name}
        </Text>
      </View>
    </View>
  );
};
