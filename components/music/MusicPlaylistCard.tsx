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
  playlist: BaseItemDto;
  width?: number;
}

export const MusicPlaylistCard: React.FC<Props> = ({
  playlist,
  width = 150,
}) => {
  const [api] = useAtom(apiAtom);
  const router = useRouter();

  const imageUrl = useMemo(
    () => getPrimaryImageUrl({ api, item: playlist }),
    [api, playlist],
  );

  const handlePress = useCallback(() => {
    router.push({
      pathname: "/music/playlist/[playlistId]",
      params: { playlistId: playlist.Id! },
    });
  }, [router, playlist.Id]);

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
            <Text className='text-4xl'>🎶</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={1} className='text-white text-sm font-medium mt-2'>
        {playlist.Name}
      </Text>
      <Text numberOfLines={1} className='text-neutral-400 text-xs'>
        {playlist.ChildCount} tracks
      </Text>
    </TouchableOpacity>
  );
};
