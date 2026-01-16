import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

export const TV_POSTER_WIDTH = 210;

type SeriesPosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
};

const SeriesPoster: React.FC<SeriesPosterProps> = ({ item }) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(() => {
    if (item.Type === "Episode") {
      return `${api?.basePath}/Items/${item.SeriesId}/Images/Primary?fillHeight=630&quality=80&tag=${item.SeriesPrimaryImageTag}`;
    }
    return getPrimaryImageUrl({
      api,
      item,
      width: 420, // 2x for quality on large screens
    });
  }, [api, item]);

  const blurhash = useMemo(() => {
    const key = item.ImageTags?.Primary as string;
    return item.ImageBlurHashes?.Primary?.[key];
  }, [item]);

  return (
    <View
      style={{
        width: TV_POSTER_WIDTH,
        aspectRatio: 10 / 15,
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#262626",
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
