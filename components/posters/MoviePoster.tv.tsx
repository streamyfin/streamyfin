import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";
import { WatchedIndicator } from "@/components/WatchedIndicator";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import {
  GlassPosterView,
  isGlassEffectAvailable,
} from "@/modules/glass-poster";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

type MoviePosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
};

const MoviePoster: React.FC<MoviePosterProps> = ({
  item,
  showProgress = false,
}) => {
  const [api] = useAtom(apiAtom);
  const posterSizes = useScaledTVPosterSizes();

  const url = useMemo(() => {
    return getPrimaryImageUrl({
      api,
      item,
      width: posterSizes.poster * 2, // 2x for quality on large screens
    });
  }, [api, item, posterSizes.poster]);

  const progress = item.UserData?.PlayedPercentage || 0;
  const isWatched = item.UserData?.Played === true;

  const blurhash = useMemo(() => {
    const key = item.ImageTags?.Primary as string;
    return item.ImageBlurHashes?.Primary?.[key];
  }, [item]);

  // Use glass effect on tvOS 26+
  const useGlass = isGlassEffectAvailable();

  if (useGlass) {
    return (
      <GlassPosterView
        imageUrl={url ?? null}
        aspectRatio={10 / 15}
        cornerRadius={24}
        progress={showProgress ? progress : 0}
        showWatchedIndicator={isWatched}
        isFocused={false}
        width={posterSizes.poster}
        style={{ width: posterSizes.poster }}
      />
    );
  }

  // Fallback for older tvOS versions
  return (
    <View
      style={{
        position: "relative",
        borderRadius: 24,
        overflow: "hidden",
        width: posterSizes.poster,
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
