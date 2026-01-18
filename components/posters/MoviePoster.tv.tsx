import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";
import { WatchedIndicator } from "@/components/WatchedIndicator";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

export const TV_POSTER_WIDTH = 210;

type MoviePosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
};

const MoviePoster: React.FC<MoviePosterProps> = ({
  item,
  showProgress = false,
}) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(() => {
    return getPrimaryImageUrl({
      api,
      item,
      width: 420, // 2x for quality on large screens
    });
  }, [api, item]);

  const progress = item.UserData?.PlayedPercentage || 0;

  const blurhash = useMemo(() => {
    const key = item.ImageTags?.Primary as string;
    return item.ImageBlurHashes?.Primary?.[key];
  }, [item]);

  return (
    <View
      style={{
        position: "relative",
        borderRadius: 24,
        overflow: "hidden",
        width: TV_POSTER_WIDTH,
        aspectRatio: 10 / 15,
      }}
    >
      <Image
        placeholder={{
          blurhash,
        }}
        key={item.Id}
        id={item.Id}
        source={
          url
            ? {
                uri: url,
              }
            : null
        }
        cachePolicy={"memory-disk"}
        contentFit='cover'
        style={{
          aspectRatio: 10 / 15,
          width: "100%",
        }}
      />
      <WatchedIndicator item={item} />
      {showProgress && progress > 0 && (
        <View
          style={{
            height: 4,
            backgroundColor: "#dc2626",
            width: "100%",
          }}
        />
      )}
    </View>
  );
};

export default MoviePoster;
