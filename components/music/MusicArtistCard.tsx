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

const IMAGE_SIZE = 48;

export const MusicArtistCard: React.FC<Props> = ({ artist }) => {
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
      className='flex-row items-center py-2'
    >
      <View
        style={{
          width: IMAGE_SIZE,
          height: IMAGE_SIZE,
          borderRadius: IMAGE_SIZE / 2,
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
            <Text className='text-xl'>👤</Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        className='text-white text-base font-medium ml-3 flex-1'
      >
        {artist.Name}
      </Text>
    </TouchableOpacity>
  );
};
