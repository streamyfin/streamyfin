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
  artist: BaseItemDto;
  size?: number;
}

export const MusicArtistCard: React.FC<Props> = ({ artist, size = 100 }) => {
  const [api] = useAtom(apiAtom);
  const router = useRouter();

  const imageUrl = useMemo(
    () => getPrimaryImageUrl({ api, item: artist }),
    [api, artist],
  );

  const handlePress = useCallback(() => {
    router.push({
      pathname: "/music/artist/[artistId]",
      params: { artistId: artist.Id! },
    });
  }, [router, artist.Id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={{ width: size }}
      className='flex flex-col items-center'
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
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
            <Text className='text-3xl'>👤</Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={2}
        className='text-white text-xs font-medium mt-2 text-center'
      >
        {artist.Name}
      </Text>
    </TouchableOpacity>
  );
};
