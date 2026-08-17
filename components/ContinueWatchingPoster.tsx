import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getWideImageUrl } from "@/utils/jellyfin/image/getWideImageUrl";
import { ProgressBar } from "./common/ProgressBar";
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
  const url = useMemo(
    () => getWideImageUrl({ api, item, useEpisodePoster }),
    // useEpisodePoster in deps so flipping the prop re-computes the URL live.
    [api, item, useEpisodePoster],
  );

  if (!url)
    return <View className='aspect-video border border-neutral-800 w-44' />;

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
      {!item.UserData?.Played && <WatchedIndicator item={item} />}
      <ProgressBar item={item} />
    </View>
  );
};

export default ContinueWatchingPoster;
