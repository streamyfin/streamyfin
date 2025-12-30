import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";

type MusicPosterProps = {
  item: BaseItemDto;
  size?: "small" | "medium" | "large";
};

const MusicPoster: React.FC<MusicPosterProps> = ({ item, size = "medium" }) => {
  const [api] = useAtom(apiAtom);

  const sizeClasses = {
    small: "w-20",
    medium: "w-28",
    large: "w-44",
  };

  const imageWidth = {
    small: 200,
    medium: 300,
    large: 400,
  };

  const url = useMemo(() => {
    if (!api) return null;

    // For Audio tracks, prefer album artwork via AlbumId
    if (item.Type === "Audio" && item.AlbumId) {
      return `${api.basePath}/Items/${item.AlbumId}/Images/Primary?fillWidth=${imageWidth[size]}&fillHeight=${imageWidth[size]}&quality=90`;
    }

    // For MusicAlbum or Audio with own artwork
    if (item.ImageTags?.Primary) {
      return `${api.basePath}/Items/${item.Id}/Images/Primary?fillWidth=${imageWidth[size]}&fillHeight=${imageWidth[size]}&quality=90&tag=${item.ImageTags.Primary}`;
    }

    return null;
  }, [api, item, size]);

  const blurhash = useMemo(() => {
    const key = item.ImageTags?.Primary as string;
    return item.ImageBlurHashes?.Primary?.[key];
  }, [item]);

  return (
    <View
      className={`relative rounded-lg overflow-hidden border border-neutral-900 ${sizeClasses[size]} aspect-square`}
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
          aspectRatio: 1,
          width: "100%",
        }}
      />
    </View>
  );
};

export default MusicPoster;
