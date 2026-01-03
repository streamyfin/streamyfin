import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { CreatePlaylistModal } from "@/components/music/CreatePlaylistModal";
import { MusicTrackItem } from "@/components/music/MusicTrackItem";
import { PlaylistPickerSheet } from "@/components/music/PlaylistPickerSheet";
import { TrackOptionsSheet } from "@/components/music/TrackOptionsSheet";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { runtimeTicksToMinutes } from "@/utils/time";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ARTWORK_SIZE = SCREEN_WIDTH * 0.5;

export default function AlbumDetailScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { playQueue } = useMusicPlayer();

  const [selectedTrack, setSelectedTrack] = useState<BaseItemDto | null>(null);
  const [trackOptionsOpen, setTrackOptionsOpen] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);

  const handleTrackOptionsPress = useCallback((track: BaseItemDto) => {
    setSelectedTrack(track);
    setTrackOptionsOpen(true);
  }, []);

  const handleAddToPlaylist = useCallback(() => {
    setPlaylistPickerOpen(true);
  }, []);

  const handleCreateNewPlaylist = useCallback(() => {
    setCreatePlaylistOpen(true);
  }, []);

  const { data: album, isLoading: loadingAlbum } = useQuery({
    queryKey: ["music-album", albumId, user?.Id],
    queryFn: async () => {
      const response = await getUserLibraryApi(api!).getItem({
        userId: user?.Id,
        itemId: albumId!,
      });
      return response.data;
    },
    enabled: !!api && !!user?.Id && !!albumId,
  });

  const { data: tracks, isLoading: loadingTracks } = useQuery({
    queryKey: ["music-album-tracks", albumId, user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: albumId,
        sortBy: ["IndexNumber"],
        sortOrder: ["Ascending"],
      });
      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id && !!albumId,
  });

  useEffect(() => {
    navigation.setOptions({
      title: album?.Name ?? "",
      headerTransparent: true,
      headerStyle: { backgroundColor: "transparent" },
      headerShadowVisible: false,
    });
  }, [album?.Name, navigation]);

  const imageUrl = useMemo(
    () => (album ? getPrimaryImageUrl({ api, item: album }) : null),
    [api, album],
  );

  const totalDuration = useMemo(() => {
    if (!tracks) return "";
    const totalTicks = tracks.reduce(
      (acc, track) => acc + (track.RunTimeTicks || 0),
      0,
    );
    return runtimeTicksToMinutes(totalTicks);
  }, [tracks]);

  const handlePlayAll = useCallback(() => {
    if (tracks && tracks.length > 0) {
      playQueue(tracks, 0);
    }
  }, [playQueue, tracks]);

  const handleShuffle = useCallback(() => {
    if (tracks && tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playQueue(shuffled, 0);
    }
  }, [playQueue, tracks]);

  const isLoading = loadingAlbum || loadingTracks;

  if (isLoading) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (!album) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Text className='text-neutral-500'>{t("music.album_not_found")}</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={tracks || []}
      contentContainerStyle={{
        paddingBottom: insets.bottom + 100,
      }}
      ListHeaderComponent={
        <View
          className='items-center px-4 pb-6 bg-black'
          style={{ paddingTop: insets.top + 60 }}
        >
          {/* Album artwork */}
          <View
            style={{
              width: ARTWORK_SIZE,
              height: ARTWORK_SIZE,
              borderRadius: 8,
              overflow: "hidden",
              backgroundColor: "#1a1a1a",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
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
                <Ionicons name='disc' size={60} color='#666' />
              </View>
            )}
          </View>

          {/* Album info */}
          <Text className='text-white text-xl font-bold mt-4 text-center'>
            {album.Name}
          </Text>
          <Text className='text-purple-400 text-base mt-1'>
            {album.AlbumArtist || album.Artists?.join(", ")}
          </Text>
          <Text className='text-neutral-500 text-sm mt-1'>
            {album.ProductionYear && `${album.ProductionYear} • `}
            {tracks?.length} tracks • {totalDuration}
          </Text>

          {/* Play buttons */}
          <View className='flex flex-row mt-4'>
            <TouchableOpacity
              onPress={handlePlayAll}
              className='flex flex-row items-center bg-purple-600 px-6 py-3 rounded-full mr-3'
            >
              <Ionicons name='play' size={20} color='white' />
              <Text className='text-white font-medium ml-2'>
                {t("music.play")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShuffle}
              className='flex flex-row items-center bg-neutral-800 px-6 py-3 rounded-full'
            >
              <Ionicons name='shuffle' size={20} color='white' />
              <Text className='text-white font-medium ml-2'>
                {t("music.shuffle")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      }
      renderItem={({ item, index }) => (
        <MusicTrackItem
          track={item}
          index={index + 1}
          queue={tracks}
          showArtwork={false}
          onOptionsPress={handleTrackOptionsPress}
        />
      )}
      keyExtractor={(item) => item.Id!}
      ListFooterComponent={
        <>
          <TrackOptionsSheet
            open={trackOptionsOpen}
            setOpen={setTrackOptionsOpen}
            track={selectedTrack}
            onAddToPlaylist={handleAddToPlaylist}
          />
          <PlaylistPickerSheet
            open={playlistPickerOpen}
            setOpen={setPlaylistPickerOpen}
            trackToAdd={selectedTrack}
            onCreateNew={handleCreateNewPlaylist}
          />
          <CreatePlaylistModal
            open={createPlaylistOpen}
            setOpen={setCreatePlaylistOpen}
            initialTrackId={selectedTrack?.Id}
          />
        </>
      }
    />
  );
}
