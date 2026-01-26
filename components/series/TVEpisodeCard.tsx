import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { View } from "react-native";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Text } from "@/components/common/Text";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { WatchedIndicator } from "@/components/WatchedIndicator";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { apiAtom } from "@/providers/JellyfinProvider";
import { runtimeTicksToMinutes } from "@/utils/time";

interface TVEpisodeCardProps {
  episode: BaseItemDto;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  /** When true, the item remains focusable even when disabled (for navigation purposes) */
  focusableWhenDisabled?: boolean;
  /** Shows a "Now Playing" badge on the card */
  isCurrent?: boolean;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Setter function for the ref (for focus guide destinations) */
  refSetter?: (ref: View | null) => void;
}

export const TVEpisodeCard: React.FC<TVEpisodeCardProps> = ({
  episode,
  hasTVPreferredFocus = false,
  disabled = false,
  focusableWhenDisabled = false,
  isCurrent = false,
  onPress,
  onFocus,
  onBlur,
  refSetter,
}) => {
  const typography = useScaledTVTypography();
  const posterSizes = useScaledTVPosterSizes();
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
    <View
      style={{
        width: posterSizes.episode,
        opacity: isCurrent ? 0.75 : disabled ? 0.5 : 1,
      }}
    >
      <TVFocusablePoster
        onPress={onPress}
        hasTVPreferredFocus={hasTVPreferredFocus}
        disabled={disabled}
        focusableWhenDisabled={focusableWhenDisabled}
        onFocus={onFocus}
        onBlur={onBlur}
        refSetter={refSetter}
      >
        <View
          style={{
            width: posterSizes.episode,
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

          {/* Now Playing badge */}
          {isCurrent && (
            <View
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                backgroundColor: "#FFFFFF",
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 8,
                gap: 6,
              }}
            >
              <Ionicons name='play' size={16} color='#000000' />
              <Text
                style={{
                  color: "#000000",
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                Now Playing
              </Text>
            </View>
          )}
        </View>
      </TVFocusablePoster>

      {/* Episode info below thumbnail */}
      <View style={{ marginTop: 12, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {episodeLabel && (
            <Text
              style={{
                fontSize: typography.callout,
                color: "#FFFFFF",
                fontWeight: "500",
              }}
            >
              {episodeLabel}
            </Text>
          )}
          {duration && (
            <>
              <Text style={{ color: "#FFFFFF", fontSize: typography.callout }}>
                •
              </Text>
              <Text style={{ fontSize: typography.callout, color: "#FFFFFF" }}>
                {duration}
              </Text>
            </>
          )}
        </View>
        <Text
          numberOfLines={2}
          style={{
            fontSize: typography.callout,
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
