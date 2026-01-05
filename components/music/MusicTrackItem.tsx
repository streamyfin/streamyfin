import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { AnimatedEqualizer } from "@/components/music/AnimatedEqualizer";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
  audioStorageEvents,
  getLocalPath,
  isPermanentDownloading,
  isPermanentlyDownloaded,
} from "@/providers/AudioStorage";
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
  index: _index,
  queue,
  showArtwork = true,
  onOptionsPress,
}) => {
  const [api] = useAtom(apiAtom);
  const { playTrack, currentTrack, isPlaying, loadingTrackId } =
    useMusicPlayer();
  const { isConnected, serverConnected } = useNetworkStatus();

  const imageUrl = useMemo(() => {
    const albumId = track.AlbumId || track.ParentId;
    if (albumId) {
      return `${api?.basePath}/Items/${albumId}/Images/Primary?maxHeight=100&maxWidth=100`;
    }
    return getPrimaryImageUrl({ api, item: track });
  }, [api, track]);

  const isCurrentTrack = currentTrack?.Id === track.Id;
  const isTrackLoading = loadingTrackId === track.Id;

  // Track download status with reactivity to completion events
  // Only track permanent downloads - we don't show UI for auto-caching
  const [downloadStatus, setDownloadStatus] = useState<
    "none" | "downloading" | "downloaded"
  >(() => {
    if (isPermanentlyDownloaded(track.Id)) return "downloaded";
    if (isPermanentDownloading(track.Id)) return "downloading";
    return "none";
  });

  // Listen for download completion/error events (only for permanent downloads)
  useEffect(() => {
    const onComplete = (event: { itemId: string; permanent: boolean }) => {
      if (event.itemId === track.Id && event.permanent) {
        setDownloadStatus("downloaded");
      }
    };
    const onError = (event: { itemId: string }) => {
      if (event.itemId === track.Id) {
        setDownloadStatus("none");
      }
    };

    audioStorageEvents.on("complete", onComplete);
    audioStorageEvents.on("error", onError);

    return () => {
      audioStorageEvents.off("complete", onComplete);
      audioStorageEvents.off("error", onError);
    };
  }, [track.Id]);

  // Also check periodically if permanent download started (for when download is triggered externally)
  useEffect(() => {
    if (downloadStatus === "none" && isPermanentDownloading(track.Id)) {
      setDownloadStatus("downloading");
    }
  });

  const _isDownloaded = downloadStatus === "downloaded";
  // Check if available locally (either cached or permanently downloaded)
  const isAvailableLocally = !!getLocalPath(track.Id);
  // Consider offline if either no network connection OR server is unreachable
  const isOffline = !isConnected || serverConnected === false;
  const isUnavailableOffline = isOffline && !isAvailableLocally;

  const duration = useMemo(() => {
    if (!track.RunTimeTicks) return "";
    return formatDuration(track.RunTimeTicks);
  }, [track.RunTimeTicks]);

  const handlePress = useCallback(() => {
    if (isUnavailableOffline) return;
    playTrack(track, queue);
  }, [playTrack, track, queue, isUnavailableOffline]);

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
      disabled={isUnavailableOffline}
      className={`flex-row items-center py-1.5 pl-4 pr-3 ${isCurrentTrack ? "bg-purple-900/20" : ""}`}
      style={isUnavailableOffline ? { opacity: 0.5 } : undefined}
    >
      {/* Album artwork */}
      {showArtwork && (
        <View
          style={{
            width: 44,
            height: 44,
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
              <Ionicons name='musical-note' size={18} color='#737373' />
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

      {/* Track info */}
      <View className='flex-1 mr-3'>
        <View className='flex-row items-center'>
          {isCurrentTrack && isPlaying && <AnimatedEqualizer />}
          <Text
            numberOfLines={1}
            className={`flex-1 text-sm ${isCurrentTrack ? "text-purple-400 font-medium" : "text-white"}`}
          >
            {track.Name}
          </Text>
        </View>
        <Text numberOfLines={1} className='text-neutral-500 text-xs mt-0.5'>
          {track.Artists?.join(", ") || track.AlbumArtist}
        </Text>
      </View>

      {/* Download status indicator */}
      {downloadStatus === "downloading" && (
        <ActivityIndicator
          size={14}
          color='#9334E9'
          style={{ marginRight: 8 }}
        />
      )}
      {downloadStatus === "downloaded" && (
        <Ionicons
          name='checkmark-circle'
          size={14}
          color='#22c55e'
          style={{ marginRight: 8 }}
        />
      )}

      {/* Duration */}
      <Text className='text-neutral-500 text-xs'>{duration}</Text>

      {/* Options button */}
      {onOptionsPress && (
        <TouchableOpacity
          onPress={handleOptionsPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className='pl-3 py-1'
        >
          <Ionicons name='ellipsis-vertical' size={16} color='#737373' />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};
