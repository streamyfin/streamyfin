import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { WatchedIndicator } from "@/components/WatchedIndicator";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPortraitImageUrl } from "@/utils/jellyfin/image/getPortraitImageUrl";

type MoviePosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
};

const SeriesPoster: React.FC<MoviePosterProps> = ({ item }) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(
    () => getPortraitImageUrl({ api, item, width: 300 }),
    [api, item],
  );

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
      <WatchedIndicator item={item} />
    </View>
  );
};

export default SeriesPoster;
