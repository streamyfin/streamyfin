import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { getLocalPath } from "@/providers/AudioStorage";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

interface Props {
  playlist: BaseItemDto;
  width?: number;
}

const IMAGE_SIZE = 56;

export const MusicPlaylistCard: React.FC<Props> = ({ playlist }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const router = useRouter();

  const imageUrl = useMemo(
    () => getPrimaryImageUrl({ api, item: playlist }),
    [api, playlist],
  );

  // Fetch playlist tracks to check download status
  const { data: tracks } = useQuery({
    queryKey: ["playlist-tracks-status", playlist.Id, user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: playlist.Id,
        fields: ["MediaSources"],
      });
      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id && !!playlist.Id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Calculate download status
  const downloadStatus = useMemo(() => {
    if (!tracks || tracks.length === 0) {
      return { downloaded: 0, total: playlist.ChildCount || 0 };
    }
    const downloaded = tracks.filter(
      (track) => !!getLocalPath(track.Id),
    ).length;
    return { downloaded, total: tracks.length };
  }, [tracks, playlist.ChildCount]);

  const allDownloaded =
    downloadStatus.total > 0 &&
    downloadStatus.downloaded === downloadStatus.total;
  const hasDownloads = downloadStatus.downloaded > 0;

  const handlePress = useCallback(() => {
    router.push({
      pathname: "/music/playlist/[playlistId]",
      params: { playlistId: playlist.Id! },
    });
  }, [router, playlist.Id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      className='flex-row items-center py-2'
    >
      <View
        style={{
          width: IMAGE_SIZE,
          height: IMAGE_SIZE,
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
            <Text className='text-2xl'>🎶</Text>
          </View>
        )}
      </View>
      <View className='flex-1 ml-3'>
        <Text numberOfLines={1} className='text-white text-base font-medium'>
          {playlist.Name}
        </Text>
        <Text numberOfLines={1} className='text-neutral-400 text-sm mt-0.5'>
          {playlist.ChildCount} tracks
        </Text>
      </View>
      {/* Download status indicator */}
      {allDownloaded ? (
        <Ionicons
          name='checkmark-circle'
          size={18}
          color='#22c55e'
          style={{ marginRight: 4 }}
        />
      ) : hasDownloads ? (
        <Text className='text-neutral-500 text-xs mr-1'>
          {downloadStatus.downloaded}/{downloadStatus.total}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};
