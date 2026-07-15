import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import React, { useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  View,
  type ViewStyle,
} from "react-native";
import { ProgressBar } from "@/components/common/ProgressBar";
import { Text } from "@/components/common/Text";
import {
  UnplayedCountBadge,
  WatchedIndicator,
} from "@/components/WatchedIndicator";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import {
  GlassPosterView,
  isGlassEffectAvailable,
} from "@/modules/glass-poster";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { scaleSize } from "@/utils/scaleSize";
import { runtimeTicksToMinutes } from "@/utils/time";

export interface TVPosterCardProps {
  item: BaseItemDto;
  /** Poster orientation: vertical = 10:15 (portrait), horizontal = 16:9 (landscape) */
  orientation?: "vertical" | "horizontal";
  /** Show text below the poster (title, subtitle) - default: true */
  showText?: boolean;
  /** Show progress bar - default: true for items with progress */
  showProgress?: boolean;
  /** Show watched indicator - default: true */
  showWatchedIndicator?: boolean;

  // Focus props
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  /** When true, the item remains focusable even when disabled (for navigation purposes) */
  focusableWhenDisabled?: boolean;

  /** Shows a "Now Playing" badge on the card */
  isCurrent?: boolean;
  /** Show a play button overlay */
  showPlayButton?: boolean;

  // Handlers
  onPress: () => void;
  onLongPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;

  /** Setter function for the ref (for focus guide destinations) */
  refSetter?: (ref: View | null) => void;

  /** Custom width - overrides default based on orientation */
  width?: number;

  /** Custom style for the outer container */
  style?: ViewStyle;

  /** Glow color for focus state */
  glowColor?: "white" | "purple";

  /** Scale amount for focus animation */
  scaleAmount?: number;

  /** Custom image URL getter - if not provided, uses smart URL logic */
  imageUrlGetter?: (item: BaseItemDto) => string | undefined;

  /** For horizontal episodes, prefer the episode's own image over the series thumb */
  preferEpisodeImage?: boolean;
}

/**
 * TVPosterCard - Unified poster component for TV interface.
 *
 * Combines image rendering, focus handling, and text display into a single component.
 * Supports both portrait (10:15) and landscape (16:9) orientations.
 *
 * Features:
 * - Glass effect on tvOS 26+ with fallback
 * - Focus handling with scale animation and glow
 * - Progress bar and watched indicator
 * - Smart subtitle text based on item type
 * - "Now Playing" badge for current items
 */
export const TVPosterCard: React.FC<TVPosterCardProps> = ({
  item,
  orientation = "vertical",
  showText = true,
  showProgress = true,
  showWatchedIndicator = true,
  hasTVPreferredFocus = false,
  disabled = false,
  focusableWhenDisabled = false,
  isCurrent = false,
  showPlayButton = false,
  onPress,
  onLongPress,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  refSetter,
  width: customWidth,
  style,
  glowColor = "white",
  scaleAmount = 1.05,
  imageUrlGetter,
  preferEpisodeImage = false,
}) => {
  const api = useAtomValue(apiAtom);
  const posterSizes = useScaledTVPosterSizes();
  const typography = useScaledTVTypography();

  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  // Determine width based on orientation
  const width = useMemo(() => {
    if (customWidth) return customWidth;
    return orientation === "horizontal"
      ? posterSizes.episode
      : posterSizes.poster;
  }, [customWidth, orientation, posterSizes]);

  const aspectRatio = orientation === "horizontal" ? 16 / 9 : 10 / 15;

  // Smart image URL selection
  const imageUrl = useMemo(() => {
    // Use custom getter if provided
    if (imageUrlGetter) {
      return imageUrlGetter(item) ?? null;
    }

    if (!api) return null;

    // Horizontal orientation: prefer thumbs/backdrops for landscape images
    if (orientation === "horizontal") {
      // Episode: prefer series thumb image for consistent look (like hero section)
      if (item.Type === "Episode") {
        // Opt-in: use the episode's own image instead of the series thumb.
        if (preferEpisodeImage && item.ImageTags?.Primary) {
          return `${api.basePath}/Items/${item.Id}/Images/Primary?fillHeight=600&quality=80&tag=${item.ImageTags.Primary}`;
        }
        // First try parent/series thumb (horizontal series artwork)
        if (item.ParentBackdropItemId && item.ParentThumbImageTag) {
          return `${api.basePath}/Items/${item.ParentBackdropItemId}/Images/Thumb?fillHeight=700&quality=80&tag=${item.ParentThumbImageTag}`;
        }
        // Fall back to episode's own primary image
        if (item.ImageTags?.Primary) {
          return `${api.basePath}/Items/${item.Id}/Images/Primary?fillHeight=600&quality=80&tag=${item.ImageTags.Primary}`;
        }
        // Last resort: try primary without tag
        return `${api.basePath}/Items/${item.Id}/Images/Primary?fillHeight=700&quality=80`;
      }

      // Movie/Series/Program: prefer thumb over primary
      if (item.ImageTags?.Thumb) {
        return `${api.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=700&quality=80&tag=${item.ImageTags.Thumb}`;
      }
      return `${api.basePath}/Items/${item.Id}/Images/Primary?fillHeight=700&quality=80`;
    }

    // Vertical orientation: use primary image
    // For episodes, get the series primary image
    if (
      item.Type === "Episode" &&
      item.SeriesId &&
      item.SeriesPrimaryImageTag
    ) {
      return `${api.basePath}/Items/${item.SeriesId}/Images/Primary?fillHeight=${width * 3}&quality=80&tag=${item.SeriesPrimaryImageTag}`;
    }

    return getPrimaryImageUrl({
      api,
      item,
      width: width * 2, // 2x for quality on large screens
    });
  }, [api, item, orientation, width, imageUrlGetter, preferEpisodeImage]);

  // Progress calculation
  const progress = useMemo(() => {
    if (!showProgress) return 0;

    if (item.Type === "Program") {
      if (!item.StartDate || !item.EndDate) return 0;
      const startDate = new Date(item.StartDate);
      const endDate = new Date(item.EndDate);
      const now = new Date();
      const total = endDate.getTime() - startDate.getTime();
      if (total <= 0) return 0;
      const elapsed = now.getTime() - startDate.getTime();
      return (elapsed / total) * 100;
    }
    return item.UserData?.PlayedPercentage || 0;
  }, [item, showProgress]);

  const isWatched = showWatchedIndicator && item.UserData?.Played === true;

  // Blurhash for placeholder
  const blurhash = useMemo(() => {
    const key = item.ImageTags?.Primary as string;
    return item.ImageBlurHashes?.Primary?.[key];
  }, [item]);

  // Glass effect availability
  const useGlass = isGlassEffectAvailable();

  // Focus animation
  const animateTo = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const shadowColor = glowColor === "white" ? "#ffffff" : "#a855f7";

  // Text rendering helpers
  const renderSubtitle = () => {
    if (!showText) return null;

    // Episode: S#:E# • duration
    if (item.Type === "Episode") {
      const season = item.ParentIndexNumber;
      const ep = item.IndexNumber;
      const episodeLabel =
        season !== undefined && ep !== undefined ? `S${season}:E${ep}` : null;
      const duration = item.RunTimeTicks
        ? runtimeTicksToMinutes(item.RunTimeTicks)
        : null;

      return (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: scaleSize(8),
          }}
        >
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
      );
    }

    // Program: channel name
    if (item.Type === "Program" && item.ChannelName) {
      return (
        <Text
          numberOfLines={1}
          style={{
            fontSize: typography.callout,
            color: "#9CA3AF",
            marginTop: scaleSize(4),
          }}
        >
          {item.ChannelName}
        </Text>
      );
    }

    // MusicAlbum: artist
    if (item.Type === "MusicAlbum") {
      const artist = item.AlbumArtist || item.Artists?.join(", ");
      if (artist) {
        return (
          <Text
            numberOfLines={1}
            style={{
              fontSize: typography.callout,
              color: "#9CA3AF",
              marginTop: scaleSize(4),
            }}
          >
            {artist}
          </Text>
        );
      }
    }

    // Audio: artist
    if (item.Type === "Audio") {
      const artist = item.Artists?.join(", ") || item.AlbumArtist;
      if (artist) {
        return (
          <Text
            numberOfLines={1}
            style={{
              fontSize: typography.callout,
              color: "#9CA3AF",
              marginTop: scaleSize(4),
            }}
          >
            {artist}
          </Text>
        );
      }
    }

    // Playlist: track count
    if (item.Type === "Playlist" && item.ChildCount) {
      return (
        <Text
          style={{
            fontSize: typography.callout,
            color: "#9CA3AF",
            marginTop: scaleSize(4),
          }}
        >
          {item.ChildCount} tracks
        </Text>
      );
    }

    // Default: production year
    if (item.ProductionYear) {
      return (
        <Text
          numberOfLines={1}
          style={{
            fontSize: typography.callout,
            color: "#9CA3AF",
            marginTop: scaleSize(4),
          }}
        >
          {item.ProductionYear}
        </Text>
      );
    }

    return null;
  };

  // Now Playing badge component
  const NowPlayingBadge = isCurrent ? (
    <View
      style={{
        position: "absolute",
        top: scaleSize(12),
        left: scaleSize(12),
        backgroundColor: "#FFFFFF",
        borderRadius: scaleSize(8),
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: scaleSize(12),
        paddingVertical: scaleSize(8),
        gap: scaleSize(6),
        zIndex: 10,
      }}
    >
      <Ionicons name='play' size={scaleSize(16)} color='#000000' />
      <Text
        style={{
          color: "#000000",
          fontSize: scaleSize(14),
          fontWeight: "700",
        }}
      >
        Now Playing
      </Text>
    </View>
  ) : null;

  // Play button overlay component
  const PlayButtonOverlay = showPlayButton ? (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name='play-circle' size={scaleSize(56)} color='white' />
    </View>
  ) : null;

  // Render poster image
  const renderPosterImage = () => {
    // Empty placeholder when no URL
    if (!imageUrl) {
      return (
        <View
          style={{
            width,
            aspectRatio,
            borderRadius: scaleSize(24),
            backgroundColor: "#1a1a1a",
            borderWidth: scaleSize(2),
            borderColor: focused ? "#FFFFFF" : "transparent",
          }}
        />
      );
    }

    // Glass effect rendering (tvOS 26+)
    if (useGlass) {
      return (
        <View style={{ position: "relative" }}>
          <GlassPosterView
            imageUrl={imageUrl}
            aspectRatio={aspectRatio}
            cornerRadius={scaleSize(24)}
            progress={progress}
            showWatchedIndicator={isWatched}
            isFocused={focused}
            width={width}
            style={{ width }}
          />
          {PlayButtonOverlay}
          {NowPlayingBadge}
          {/*
            The glass view draws the watched checkmark natively but cannot show
            an unplayed-episode count, so render it as an RN overlay on top.
            Returns null when not applicable (non-series / fully watched).
          */}
          {showWatchedIndicator && <UnplayedCountBadge item={item} />}
        </View>
      );
    }

    // Fallback rendering for older tvOS versions
    return (
      <View
        style={{
          position: "relative",
          width,
          aspectRatio,
          borderRadius: scaleSize(24),
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
          borderWidth: scaleSize(2),
          borderColor: focused ? "#FFFFFF" : "transparent",
        }}
      >
        <Image
          placeholder={{ blurhash }}
          key={item.Id}
          source={{ uri: imageUrl }}
          recyclingKey={item.Id}
          cachePolicy='memory-disk'
          contentFit='cover'
          style={{
            width: "100%",
            height: "100%",
          }}
        />
        {PlayButtonOverlay}
        {NowPlayingBadge}
        {showWatchedIndicator && <WatchedIndicator item={item} />}
        <ProgressBar item={item} />
      </View>
    );
  };

  // Render title based on item type
  const renderTitle = () => {
    if (!showText) return null;

    // Episode: show episode name as title
    if (item.Type === "Episode") {
      return (
        <Text
          numberOfLines={2}
          style={{
            fontSize: typography.callout,
            color: "#FFFFFF",
            marginTop: scaleSize(4),
            fontWeight: "500",
          }}
        >
          {item.Name}
        </Text>
      );
    }

    // MusicArtist: centered text
    if (item.Type === "MusicArtist") {
      return (
        <Text
          numberOfLines={2}
          style={{
            fontSize: typography.callout,
            color: "#FFFFFF",
            textAlign: "center",
          }}
        >
          {item.Name}
        </Text>
      );
    }

    // Default: show name
    return (
      <Text
        numberOfLines={3}
        style={{
          fontSize: typography.callout,
          color: "#FFFFFF",
          marginTop: scaleSize(4),
          fontWeight: "500",
        }}
      >
        {item.Name}
      </Text>
    );
  };

  return (
    <View
      style={[
        {
          width,
          opacity: isCurrent
            ? 0.75
            : disabled && !focusableWhenDisabled
              ? 0.5
              : 1,
        },
        style,
      ]}
    >
      <Pressable
        ref={refSetter}
        onPress={onPress}
        onLongPress={onLongPress}
        onFocus={() => {
          setFocused(true);
          // Only animate scale when not using glass effect (glass handles its own focus visual)
          if (!useGlass) {
            animateTo(scaleAmount);
          }
          onFocusProp?.();
        }}
        onBlur={() => {
          setFocused(false);
          if (!useGlass) {
            animateTo(1);
          }
          onBlurProp?.();
        }}
        hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
        disabled={disabled && !focusableWhenDisabled}
        focusable={!disabled || focusableWhenDisabled}
      >
        <Animated.View
          style={{
            // Only apply scale transform when not using glass effect
            transform: useGlass ? undefined : [{ scale }],
            // Only apply shadow glow when not using glass (glass has its own glow)
            shadowColor: useGlass ? undefined : shadowColor,
            shadowOffset: useGlass ? undefined : { width: 0, height: 0 },
            shadowOpacity: useGlass ? undefined : focused ? 0.3 : 0,
            shadowRadius: useGlass ? undefined : focused ? scaleSize(12) : 0,
          }}
        >
          {renderPosterImage()}
        </Animated.View>
      </Pressable>

      {/* Text below poster */}
      {showText && (
        <View
          style={{ marginTop: scaleSize(12), paddingHorizontal: scaleSize(4) }}
        >
          {item.Type === "Episode" ? (
            <>
              {renderSubtitle()}
              {renderTitle()}
            </>
          ) : (
            <>
              {renderTitle()}
              {renderSubtitle()}
            </>
          )}
        </View>
      )}
    </View>
  );
};
