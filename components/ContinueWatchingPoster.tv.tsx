import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { View } from "react-native";
import {
  GlassPosterView,
  isGlassEffectAvailable,
} from "@/modules/glass-poster";
import { apiAtom } from "@/providers/JellyfinProvider";
import { ProgressBar } from "./common/ProgressBar";
import { WatchedIndicator } from "./WatchedIndicator";

export const TV_LANDSCAPE_WIDTH = 400;

type ContinueWatchingPosterProps = {
  item: BaseItemDto;
  useEpisodePoster?: boolean;
  size?: "small" | "normal";
  showPlayButton?: boolean;
};

const ContinueWatchingPoster: React.FC<ContinueWatchingPosterProps> = ({
  item,
  useEpisodePoster = false,
  // TV version uses fixed width, size prop kept for API compatibility
  size: _size = "normal",
  showPlayButton = false,
}) => {
  const api = useAtomValue(apiAtom);

  const url = useMemo(() => {
    if (!api) {
      return;
    }
    if (item.Type === "Episode" && useEpisodePoster) {
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=700&quality=80`;
    }
    if (item.Type === "Episode") {
      if (item.ParentBackdropItemId && item.ParentThumbImageTag) {
        return `${api?.basePath}/Items/${item.ParentBackdropItemId}/Images/Thumb?fillHeight=700&quality=80&tag=${item.ParentThumbImageTag}`;
      }
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=700&quality=80`;
    }
    if (item.Type === "Movie") {
      if (item.ImageTags?.Thumb) {
        return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=700&quality=80&tag=${item.ImageTags?.Thumb}`;
      }
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=700&quality=80`;
    }
    if (item.Type === "Program") {
      if (item.ImageTags?.Thumb) {
        return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=700&quality=80&tag=${item.ImageTags?.Thumb}`;
      }
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=700&quality=80`;
    }

    if (item.ImageTags?.Thumb) {
      return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=700&quality=80&tag=${item.ImageTags?.Thumb}`;
    }

    return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=700&quality=80`;
  }, [api, item, useEpisodePoster]);

  const progress = useMemo(() => {
    if (item.Type === "Program") {
      if (!item.StartDate || !item.EndDate) {
        return 0;
      }
      const startDate = new Date(item.StartDate);
      const endDate = new Date(item.EndDate);
      const now = new Date();
      const total = endDate.getTime() - startDate.getTime();
      if (total <= 0) {
        return 0;
      }
      const elapsed = now.getTime() - startDate.getTime();
      return (elapsed / total) * 100;
    }
    return item.UserData?.PlayedPercentage || 0;
  }, [item]);

  const isWatched = item.UserData?.Played === true;

  // Use glass effect on tvOS 26+
  const useGlass = isGlassEffectAvailable();

  if (!url) {
    return (
      <View
        style={{
          width: TV_LANDSCAPE_WIDTH,
          aspectRatio: 16 / 9,
          borderRadius: 24,
        }}
      />
    );
  }

  if (useGlass) {
    return (
      <View style={{ position: "relative" }}>
        <GlassPosterView
          imageUrl={url}
          aspectRatio={16 / 9}
          cornerRadius={24}
          progress={progress}
          showWatchedIndicator={isWatched}
          isFocused={false}
          width={TV_LANDSCAPE_WIDTH}
          style={{ width: TV_LANDSCAPE_WIDTH }}
        />
        {showPlayButton && (
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
            <Ionicons name='play-circle' size={56} color='white' />
          </View>
        )}
      </View>
    );
  }

  // Fallback for older tvOS versions
  return (
    <View
      style={{
        position: "relative",
        width: TV_LANDSCAPE_WIDTH,
        aspectRatio: 16 / 9,
        borderRadius: 24,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          key={item.Id}
          id={item.Id}
          source={{
            uri: url,
          }}
          cachePolicy={"memory-disk"}
          contentFit='cover'
          style={{
            width: "100%",
            height: "100%",
          }}
        />
        {showPlayButton && (
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
            <Ionicons name='play-circle' size={56} color='white' />
          </View>
        )}
      </View>
      <WatchedIndicator item={item} />
      <ProgressBar item={item} />
    </View>
  );
};

export default ContinueWatchingPoster;
