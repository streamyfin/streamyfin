import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import {
  GlassPosterView,
  isGlassEffectAvailable,
} from "@/modules/glass-poster";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

type SeriesPosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
};

const SeriesPoster: React.FC<SeriesPosterProps> = ({ item }) => {
  const [api] = useAtom(apiAtom);
  const posterSizes = useScaledTVPosterSizes();

  const url = useMemo(() => {
    if (item.Type === "Episode") {
      return `${api?.basePath}/Items/${item.SeriesId}/Images/Primary?fillHeight=${posterSizes.poster * 3}&quality=80&tag=${item.SeriesPrimaryImageTag}`;
    }
    return getPrimaryImageUrl({
      api,
      item,
      width: posterSizes.poster * 2, // 2x for quality on large screens
    });
  }, [api, item, posterSizes.poster]);

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
        progress={0}
        showWatchedIndicator={false}
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
        width: posterSizes.poster,
        aspectRatio: 10 / 15,
        position: "relative",
        borderRadius: 24,
        overflow: "hidden",
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
          height: "100%",
          width: "100%",
        }}
      />
    </View>
  );
};

export default SeriesPoster;
