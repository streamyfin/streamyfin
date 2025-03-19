import { apiAtom } from "@/providers/JellyfinProvider";
import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import type React from "react";
import { View } from "react-native";
import { WatchedIndicator } from "./WatchedIndicator";

type ContinueWatchingPosterProps = {
  item: BaseItemDto;
  useEpisodePoster?: boolean;
  size?: "small" | "normal";
  showPlayButton?: boolean;
};

const ContinueWatchingPoster: React.FC<ContinueWatchingPosterProps> = ({
  item,
  useEpisodePoster = false,
  size = "normal",
  showPlayButton = false,
}) => {
  const api = useAtomValue(apiAtom);

  /**
   * Get horizontal poster for movie and episode, with failover to primary.
   */
  const url = useMemo(() => {
    if (!api) return;
    if (item.Type === "Episode" && useEpisodePoster) {
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=389&quality=80`;
    }
    if (item.Type === "Episode") {
      if (item.ParentBackdropItemId && item.ParentThumbImageTag)
        return `${api?.basePath}/Items/${item.ParentBackdropItemId}/Images/Thumb?fillHeight=389&quality=80&tag=${item.ParentThumbImageTag}`;
      else
        return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=389&quality=80`;
    }
    if (item.Type === "Movie") {
      if (item.ImageTags?.["Thumb"])
        return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=389&quality=80&tag=${item.ImageTags?.["Thumb"]}`;
      else
        return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=389&quality=80`;
    }
    if (item.Type === "Program") {
      if (item.ImageTags?.["Thumb"])
        return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=389&quality=80&tag=${item.ImageTags?.["Thumb"]}`;
      else
        return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=389&quality=80`;
    }

    if (item.ImageTags?.["Thumb"])
      return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=389&quality=80&tag=${item.ImageTags?.["Thumb"]}`;
    else
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=389&quality=80`;
  }, [item]);

  const progress = useMemo(() => {
    if (item.Type === "Program") {
      const startDate = new Date(item.StartDate || "");
      const endDate = new Date(item.EndDate || "");
      const now = new Date();
      const total = endDate.getTime() - startDate.getTime();
      const elapsed = now.getTime() - startDate.getTime();
      return (elapsed / total) * 100;
    } else {
      return item.UserData?.PlayedPercentage || 0;
    }
  }, [item]);

  if (!url)
    return (
      <View className='aspect-video border border-neutral-800 w-44'></View>
    );

  return (
    <View
      className={`
      relative w-44 aspect-video rounded-lg overflow-hidden border border-neutral-800
      ${size === "small" ? "w-32" : "w-44"}
    `}
    >
      <View className='w-full h-full flex items-center justify-center'>
        <Image
          key={item.Id}
          id={item.Id}
          source={{
            uri: url,
          }}
          cachePolicy={"memory-disk"}
          contentFit='cover'
          className='w-full h-full'
        />
        {showPlayButton && (
          <View className='absolute inset-0 flex items-center justify-center'>
            <Ionicons name='play-circle' size={40} color='white' />
          </View>
        )}
      </View>
      {!progress && <WatchedIndicator item={item} />}
      {progress > 0 && (
        <>
          <View
            className={`absolute w-100 bottom-0 left-0 h-1 bg-neutral-700 opacity-80 w-full`}
          ></View>
          <View
            style={{
              width: `${progress}%`,
            }}
            className={`absolute bottom-0 left-0 h-1 bg-purple-600 w-full`}
          ></View>
        </>
      )}
    </View>
  );
};

export default ContinueWatchingPoster;
