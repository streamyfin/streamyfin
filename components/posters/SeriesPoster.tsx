import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getStoredImage } from "@/utils/storedImages";

type MoviePosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
};

const SeriesPoster: React.FC<MoviePosterProps> = ({ item }) => {
  const [api] = useAtom(apiAtom);
  const { offlineMode } = useOfflineLibrary();

  const url = useMemo(() => {
    // When offline, check for stored images first
    if (offlineMode || !api) {
      // For episodes, try series image first
      if (item.Type === "Episode" && item.SeriesId) {
        const seriesImage = getStoredImage(item.SeriesId);
        if (seriesImage) return seriesImage;
      }
      // Try the item's own stored image
      const storedImage = getStoredImage(item.Id);
      if (storedImage) return storedImage;
      if (!api) return undefined;
    }

    if (item.Type === "Episode") {
      return `${api?.basePath}/Items/${item.SeriesId}/Images/Primary?fillHeight=389&quality=80&tag=${item.SeriesPrimaryImageTag}`;
    }
    return getPrimaryImageUrl({
      api,
      item,
      width: 300,
    });
  }, [item, api, offlineMode]);

  const blurhash = useMemo(() => {
    const key = item.ImageTags?.Primary as string;
    return item.ImageBlurHashes?.Primary?.[key];
  }, [item]);

  return (
    <View className='w-28 aspect-[10/15] relative rounded-lg overflow-hidden border border-neutral-900 '>
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
