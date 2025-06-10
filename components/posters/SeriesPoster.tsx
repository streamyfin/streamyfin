import { WatchedIndicator } from "@/components/WatchedIndicator";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { View } from "react-native";

type MoviePosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
};

const SeriesPoster: React.FC<MoviePosterProps> = ({ item }) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(() => {
    if (item.Type === "Episode") {
      return `${api?.basePath}/Items/${item.SeriesId}/Images/Primary?fillHeight=389&quality=80&tag=${item.SeriesPrimaryImageTag}`;
    }
    return getPrimaryImageUrl({
      api,
      item,
      width: 300,
    });
  }, [item]);

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
      {<WatchedIndicator item={item} />}
    </View>
  );
};

export default SeriesPoster;
