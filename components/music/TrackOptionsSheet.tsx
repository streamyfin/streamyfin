import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useFavorite } from "@/hooks/useFavorite";
import {
  audioStorageEvents,
  downloadTrack,
  isCached,
  isPermanentDownloading,
  isPermanentlyDownloaded,
} from "@/providers/AudioStorage";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";
import { getAudioStreamUrl } from "@/utils/jellyfin/audio/getAudioStreamUrl";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  track: BaseItemDto | null;
  onAddToPlaylist: () => void;
  playlistId?: string;
  onRemoveFromPlaylist?: () => void;
}

export const TrackOptionsSheet: React.FC<Props> = ({
  open,
  setOpen,
  track,
  onAddToPlaylist,
  playlistId,
  onRemoveFromPlaylist,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const router = useRouter();
  const { playNext, addToQueue } = useMusicPlayer();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [isDownloadingTrack, setIsDownloadingTrack] = useState(false);
  // Counter to trigger re-evaluation of download status when storage changes
  const [storageUpdateCounter, setStorageUpdateCounter] = useState(0);

  // Listen for storage events to update download status
  useEffect(() => {
    const handleComplete = (event: { itemId: string }) => {
      if (event.itemId === track?.Id) {
        setStorageUpdateCounter((c) => c + 1);
      }
    };

    audioStorageEvents.on("complete", handleComplete);
    return () => {
      audioStorageEvents.off("complete", handleComplete);
    };
  }, [track?.Id]);

  // Use a placeholder item for useFavorite when track is null
  const { isFavorite, toggleFavorite } = useFavorite(
    track ?? ({ Id: "", UserData: { IsFavorite: false } } as BaseItemDto),
  );

  // Check download status (storageUpdateCounter triggers re-evaluation when download completes)
  const isAlreadyDownloaded = useMemo(
    () => isPermanentlyDownloaded(track?.Id),
    [track?.Id, storageUpdateCounter],
  );
  const isOnlyCached = useMemo(
    () => isCached(track?.Id),
    [track?.Id, storageUpdateCounter],
  );
  const isCurrentlyDownloading = useMemo(
    () => isPermanentDownloading(track?.Id),
    [track?.Id, storageUpdateCounter],
  );

  const imageUrl = useMemo(() => {
    if (!track) return null;
    const albumId = track.AlbumId || track.ParentId;
    if (albumId) {
      return `${api?.basePath}/Items/${albumId}/Images/Primary?maxHeight=200&maxWidth=200`;
    }
    return getPrimaryImageUrl({ api, item: track });
  }, [api, track]);

  useEffect(() => {
    if (open) bottomSheetModalRef.current?.present();
    else bottomSheetModalRef.current?.dismiss();
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  const handlePlayNext = useCallback(() => {
    if (track) {
      playNext(track);
      setOpen(false);
    }
  }, [track, playNext, setOpen]);

  const handleAddToQueue = useCallback(() => {
    if (track) {
      addToQueue(track);
      setOpen(false);
    }
  }, [track, addToQueue, setOpen]);

  const handleAddToPlaylist = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      onAddToPlaylist();
    }, 300);
  }, [onAddToPlaylist, setOpen]);

  const handleRemoveFromPlaylist = useCallback(() => {
    if (onRemoveFromPlaylist) {
      onRemoveFromPlaylist();
      setOpen(false);
    }
  }, [onRemoveFromPlaylist, setOpen]);

  const handleDownload = useCallback(async () => {
    if (!track?.Id || !api || !user?.Id || isAlreadyDownloaded) return;

    setIsDownloadingTrack(true);
    try {
      const result = await getAudioStreamUrl(api, user.Id, track.Id);
      if (result?.url && !result.isTranscoding) {
        await downloadTrack(track.Id, result.url, {
          permanent: true,
          container: result.mediaSource?.Container || undefined,
        });
      }
    } catch {
      // Silent fail
    }
    setIsDownloadingTrack(false);
    setOpen(false);
  }, [track?.Id, api, user?.Id, isAlreadyDownloaded, setOpen]);

  const handleGoToArtist = useCallback(() => {
    const artistId = track?.ArtistItems?.[0]?.Id;
    if (artistId) {
      setOpen(false);
      router.push({
        pathname: "/music/artist/[artistId]",
        params: { artistId },
      });
    }
  }, [track?.ArtistItems, router, setOpen]);

  const handleGoToAlbum = useCallback(() => {
    const albumId = track?.AlbumId || track?.ParentId;
    if (albumId) {
      setOpen(false);
      router.push({
        pathname: "/music/album/[albumId]",
        params: { albumId },
      });
    }
  }, [track?.AlbumId, track?.ParentId, router, setOpen]);

  const handleToggleFavorite = useCallback(() => {
    if (track) {
      toggleFavorite();
      setOpen(false);
    }
  }, [track, toggleFavorite, setOpen]);

  // Check if navigation options are available
  const hasArtist = !!track?.ArtistItems?.[0]?.Id;
  const hasAlbum = !!(track?.AlbumId || track?.ParentId);

  if (!track) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      enableDynamicSizing
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{
        backgroundColor: "white",
      }}
      backgroundStyle={{
        backgroundColor: "#171717",
      }}
    >
      <BottomSheetView
        style={{
          flex: 1,
          paddingLeft: Math.max(16, insets.left),
          paddingRight: Math.max(16, insets.right),
          paddingBottom: insets.bottom,
        }}
      >
        {/* Track Info Header */}
        <View className='flex-row items-center mb-6 px-2'>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 6,
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
                <Ionicons name='musical-note' size={24} color='#737373' />
              </View>
            )}
          </View>
          <View className='flex-1'>
            <Text
              numberOfLines={1}
              className='text-white font-semibold text-base'
            >
              {track.Name}
            </Text>
            <Text numberOfLines={1} className='text-neutral-400 text-sm mt-0.5'>
              {track.Artists?.join(", ") || track.AlbumArtist}
            </Text>
          </View>
        </View>

        {/* Playback Options */}
        <View className='flex-col rounded-xl overflow-hidden bg-neutral-800'>
          <TouchableOpacity
            onPress={handlePlayNext}
            className='flex-row items-center px-4 py-3.5'
          >
            <Ionicons name='play-forward' size={22} color='white' />
            <Text className='text-white ml-4 text-base'>
              {t("music.track_options.play_next")}
            </Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            onPress={handleAddToQueue}
            className='flex-row items-center px-4 py-3.5'
          >
            <Ionicons name='list' size={22} color='white' />
            <Text className='text-white ml-4 text-base'>
              {t("music.track_options.add_to_queue")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Library Options */}
        <View className='flex-col rounded-xl overflow-hidden bg-neutral-800 mt-3'>
          <TouchableOpacity
            onPress={handleToggleFavorite}
            className='flex-row items-center px-4 py-3.5'
          >
            <Ionicons
              name={isFavorite ? "heart" : "heart-outline"}
              size={22}
              color={isFavorite ? "#ec4899" : "white"}
            />
            <Text className='text-white ml-4 text-base'>
              {isFavorite
                ? t("music.track_options.remove_from_favorites")
                : t("music.track_options.add_to_favorites")}
            </Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            onPress={handleAddToPlaylist}
            className='flex-row items-center px-4 py-3.5'
          >
            <Ionicons name='albums-outline' size={22} color='white' />
            <Text className='text-white ml-4 text-base'>
              {t("music.track_options.add_to_playlist")}
            </Text>
          </TouchableOpacity>

          {playlistId && (
            <>
              <View style={styles.separator} />
              <TouchableOpacity
                onPress={handleRemoveFromPlaylist}
                className='flex-row items-center px-4 py-3.5'
              >
                <Ionicons name='trash-outline' size={22} color='#ef4444' />
                <Text className='text-red-500 ml-4 text-base'>
                  {t("music.track_options.remove_from_playlist")}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.separator} />

          <TouchableOpacity
            onPress={handleDownload}
            disabled={
              isAlreadyDownloaded ||
              isCurrentlyDownloading ||
              isDownloadingTrack
            }
            className='flex-row items-center px-4 py-3.5'
          >
            {isCurrentlyDownloading || isDownloadingTrack ? (
              <ActivityIndicator size={22} color='white' />
            ) : (
              <Ionicons
                name={
                  isAlreadyDownloaded ? "checkmark-circle" : "download-outline"
                }
                size={22}
                color={isAlreadyDownloaded ? "#22c55e" : "white"}
              />
            )}
            <Text
              className={`ml-4 text-base ${isAlreadyDownloaded ? "text-green-500" : "text-white"}`}
            >
              {isCurrentlyDownloading || isDownloadingTrack
                ? t("music.track_options.downloading")
                : isAlreadyDownloaded
                  ? t("music.track_options.downloaded")
                  : t("music.track_options.download")}
            </Text>
          </TouchableOpacity>

          {isOnlyCached && !isAlreadyDownloaded && (
            <>
              <View style={styles.separator} />
              <View className='flex-row items-center px-4 py-3.5'>
                <Ionicons name='cloud-done-outline' size={22} color='#737373' />
                <Text className='text-neutral-500 ml-4 text-base'>
                  {t("music.track_options.cached")}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Navigation Options */}
        {(hasArtist || hasAlbum) && (
          <View className='flex-col rounded-xl overflow-hidden bg-neutral-800 mt-3'>
            {hasArtist && (
              <>
                <TouchableOpacity
                  onPress={handleGoToArtist}
                  className='flex-row items-center px-4 py-3.5'
                >
                  <Ionicons name='person-outline' size={22} color='white' />
                  <Text className='text-white ml-4 text-base'>
                    {t("music.track_options.go_to_artist")}
                  </Text>
                </TouchableOpacity>
                {hasAlbum && <View style={styles.separator} />}
              </>
            )}

            {hasAlbum && (
              <TouchableOpacity
                onPress={handleGoToAlbum}
                className='flex-row items-center px-4 py-3.5'
              >
                <Ionicons name='disc-outline' size={22} color='white' />
                <Text className='text-white ml-4 text-base'>
                  {t("music.track_options.go_to_album")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#404040",
  },
});
