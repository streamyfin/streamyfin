import {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { View } from "react-native";

type PosterProps = {
  item?: BaseItemDto | BaseItemPerson | null;
  url?: string | null;
  showProgress?: boolean;
  blurhash?: string | null;
};

const Poster: React.FC<PosterProps> = ({ item, url, blurhash }) => {
  if (!item)
    return (
      <View
        className="border border-neutral-900"
        style={{
          aspectRatio: "10/15",
        }}
      ></View>
    );

  return (
    <View className="rounded-lg overflow-hidden border border-neutral-900">
      <Image
        placeholder={
          blurhash
            ? {
                blurhash,
              }
            : null
        }
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
          aspectRatio: "10/15",
        }}
      />
    </View>
  );
};

export default Poster;
