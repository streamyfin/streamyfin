import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { ProgressBar } from "./common/ProgressBar";
import { WatchedIndicator } from "./WatchedIndicator";

export const TV_LANDSCAPE_WIDTH = 340;

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
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=600&quality=80`;
    }
    if (item.Type === "Episode") {
      if (item.ParentBackdropItemId && item.ParentThumbImageTag) {
        return `${api?.basePath}/Items/${item.ParentBackdropItemId}/Images/Thumb?fillHeight=600&quality=80&tag=${item.ParentThumbImageTag}`;
      }
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=600&quality=80`;
    }
    if (item.Type === "Movie") {
      if (item.ImageTags?.Thumb) {
        return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=600&quality=80&tag=${item.ImageTags?.Thumb}`;
      }
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=600&quality=80`;
    }
    if (item.Type === "Program") {
      if (item.ImageTags?.Thumb) {
        return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=600&quality=80&tag=${item.ImageTags?.Thumb}`;
      }
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=600&quality=80`;
    }

    if (item.ImageTags?.Thumb) {
      return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=600&quality=80&tag=${item.ImageTags?.Thumb}`;
    }

    return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=600&quality=80`;
  }, [api, item, useEpisodePoster]);

  if (!url) {
    return (
      <View
        style={{
          width: TV_LANDSCAPE_WIDTH,
          aspectRatio: 16 / 9,
          borderWidth: 1,
          borderColor: "#262626",
          borderRadius: 12,
        }}
      />
    );
  }

  return (
    <View
      style={{
        position: "relative",
        width: TV_LANDSCAPE_WIDTH,
        aspectRatio: 16 / 9,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#262626",
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
      {!item.UserData?.Played && <WatchedIndicator item={item} />}
      <ProgressBar item={item} />
    </View>
  );
};

export default ContinueWatchingPoster;
