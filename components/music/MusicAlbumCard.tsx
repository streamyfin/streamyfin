import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

interface Props {
  album: BaseItemDto;
  width?: number;
}

export const MusicAlbumCard: React.FC<Props> = ({ album, width = 150 }) => {
  const [api] = useAtom(apiAtom);
  const router = useRouter();

  const imageUrl = useMemo(
    () => getPrimaryImageUrl({ api, item: album }),
    [api, album],
  );

  const handlePress = useCallback(() => {
    router.push({
      pathname: "/music/album/[albumId]",
      params: { albumId: album.Id! },
    });
  }, [router, album.Id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={{ width }}
      className='flex flex-col'
    >
      <View
        style={{
          width,
          height: width,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit='cover'
            cachePolicy='memory-disk'
          />
        ) : (
          <View className='flex-1 items-center justify-center bg-neutral-800'>
            <Text className='text-4xl'>🎵</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} className='text-white text-sm font-medium mt-2'>
        {album.Name}
      </Text>
      <Text numberOfLines={1} className='text-neutral-400 text-xs'>
        {album.AlbumArtist || album.Artists?.join(", ")}
      </Text>
    </TouchableOpacity>
  );
};
