import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";

type ArtistPosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
};

const ArtistPoster: React.FC<ArtistPosterProps> = ({
  item,
  showProgress = false,
}) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(
    () =>
      getPrimaryImageUrl({
        api,
        item,
      }),
    [item]
  );

  if (!url)
    return (
      <View
        className="rounded-lg overflow-hidden border border-neutral-900"
        style={{
          aspectRatio: "1/1",
        }}
      ></View>
    );

  return (
    <View className="relative rounded-md overflow-hidden border border-neutral-900">
      <Image
        key={item.Id}
        id={item.Id}
        source={{
          uri: url,
        }}
        cachePolicy={"memory-disk"}
        contentFit="cover"
        style={{
          aspectRatio: "1/1",
        }}
      />
    </View>
  );
};

export default ArtistPoster;
