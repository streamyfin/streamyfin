import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import React, { useCallback, useMemo } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { formatDuration } from "@/utils/time";

interface Props {
  track: BaseItemDto;
  index?: number;
  queue?: BaseItemDto[];
  showArtwork?: boolean;
  onOptionsPress?: (track: BaseItemDto) => void;
}

export const MusicTrackItem: React.FC<Props> = ({
  track,
  index,
  queue,
  showArtwork = true,
  onOptionsPress,
}) => {
  const [api] = useAtom(apiAtom);
  const { playTrack, currentTrack, isPlaying, loadingTrackId } =
    useMusicPlayer();

  const imageUrl = useMemo(() => {
    const albumId = track.AlbumId || track.ParentId;
    if (albumId) {
      return `${api?.basePath}/Items/${albumId}/Images/Primary?maxHeight=100&maxWidth=100`;
    }
    return getPrimaryImageUrl({ api, item: track });
  }, [api, track]);

  const isCurrentTrack = currentTrack?.Id === track.Id;
  const isTrackLoading = loadingTrackId === track.Id;

  const duration = useMemo(() => {
    if (!track.RunTimeTicks) return "";
    return formatDuration(track.RunTimeTicks);
  }, [track.RunTimeTicks]);

  const handlePress = useCallback(() => {
    playTrack(track, queue);
  }, [playTrack, track, queue]);

  const handleLongPress = useCallback(() => {
    onOptionsPress?.(track);
  }, [onOptionsPress, track]);

  const handleOptionsPress = useCallback(() => {
    onOptionsPress?.(track);
  }, [onOptionsPress, track]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={300}
      className={`flex flex-row items-center py-3 ${isCurrentTrack ? "bg-purple-900/20" : ""}`}
    >
      {index !== undefined && (
        <View className='w-8 items-center'>
          {isCurrentTrack && isPlaying ? (
            <Ionicons name='musical-note' size={16} color='#9334E9' />
          ) : (
            <Text className='text-neutral-500 text-sm'>{index}</Text>
          )}
        </View>
      )}

      {showArtwork && (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 4,
            overflow: "hidden",
            backgroundColor: "#1a1a1a",
            marginRight: 12,
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
              <Ionicons name='musical-note' size={20} color='#737373' />
            </View>
          )}
          {isTrackLoading && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size='small' color='white' />
            </View>
          )}
        </View>
      )}

      <View className='flex-1 mr-3'>
        <Text
          numberOfLines={1}
          className={`text-sm ${isCurrentTrack ? "text-purple-400 font-medium" : "text-white"}`}
        >
          {track.Name}
        </Text>
        <Text numberOfLines={1} className='text-neutral-400 text-xs mt-0.5'>
          {track.Artists?.join(", ") || track.AlbumArtist}
        </Text>
      </View>

      <Text className='text-neutral-500 text-xs mr-2'>{duration}</Text>

      {onOptionsPress && (
        <TouchableOpacity
          onPress={handleOptionsPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className='p-1'
        >
          <Ionicons name='ellipsis-vertical' size={18} color='#737373' />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};
