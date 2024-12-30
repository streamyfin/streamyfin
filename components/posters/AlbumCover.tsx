import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";

type ArtistPosterProps = {
  item?: BaseItemDto | null;
  id?: string | null;
  showProgress?: boolean;
};

const AlbumCover: React.FC<ArtistPosterProps> = ({ item, id }) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(() => {
    const u = getPrimaryImageUrl({
      api,
      item,
    });
    return u;
  }, [item]);

  const url2 = useMemo(() => {
    const u = getPrimaryImageUrlById({
      api,
      id,
      quality: 85,
      width: 300,
    });
    return u;
  }, [item]);

  if (!item && id)
    return (
      <View className="relative rounded-lg overflow-hidden border border-neutral-900">
        <Image
          key={id}
          id={id}
          source={
            url2
              ? {
                  uri: url2,
                }
              : null
          }
          cachePolicy={"memory-disk"}
          contentFit="cover"
          style={{
            aspectRatio: "1/1",
          }}
        />
      </View>
    );

  if (item)
    return (
      <View className="relative rounded-md overflow-hidden border border-neutral-900">
        <Image
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
          contentFit="cover"
          style={{
            aspectRatio: "1/1",
          }}
        />
      </View>
    );
};

export default AlbumCover;
