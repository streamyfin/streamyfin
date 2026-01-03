import { Ionicons } from "@expo/vector-icons";
import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HorizontalScroll } from "@/components/common/HorizontalScroll";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { MusicAlbumCard } from "@/components/music/MusicAlbumCard";
import { MusicTrackItem } from "@/components/music/MusicTrackItem";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ARTWORK_SIZE = SCREEN_WIDTH * 0.4;

export default function ArtistDetailScreen() {
  const { artistId } = useLocalSearchParams<{ artistId: string }>();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { playQueue } = useMusicPlayer();

  const { data: artist, isLoading: loadingArtist } = useQuery({
    queryKey: ["music-artist", artistId, user?.Id],
    queryFn: async () => {
      const response = await getUserLibraryApi(api!).getItem({
        userId: user?.Id,
        itemId: artistId!,
      });
      return response.data;
    },
    enabled: !!api && !!user?.Id && !!artistId,
  });

  const { data: albums, isLoading: loadingAlbums } = useQuery({
    queryKey: ["music-artist-albums", artistId, user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        artistIds: [artistId!],
        includeItemTypes: ["MusicAlbum"],
        sortBy: ["ProductionYear", "SortName"],
        sortOrder: ["Descending", "Ascending"],
        recursive: true,
      });
      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id && !!artistId,
  });

  const { data: topTracks, isLoading: loadingTracks } = useQuery({
    queryKey: ["music-artist-top-tracks", artistId, user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        artistIds: [artistId!],
        includeItemTypes: ["Audio"],
        sortBy: ["PlayCount"],
        sortOrder: ["Descending"],
        limit: 10,
        recursive: true,
        filters: ["IsPlayed"],
      });
      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id && !!artistId,
  });

  useEffect(() => {
    navigation.setOptions({
      title: artist?.Name ?? "",
      headerTransparent: true,
      headerStyle: { backgroundColor: "transparent" },
      headerShadowVisible: false,
    });
  }, [artist?.Name, navigation]);

  const imageUrl = useMemo(
    () => (artist ? getPrimaryImageUrl({ api, item: artist }) : null),
    [api, artist],
  );

  const handlePlayAllTracks = useCallback(() => {
    if (topTracks && topTracks.length > 0) {
      playQueue(topTracks, 0);
    }
  }, [playQueue, topTracks]);

  const isLoading = loadingArtist || loadingAlbums || loadingTracks;

  if (isLoading) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (!artist) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Text className='text-neutral-500'>{t("music.artist_not_found")}</Text>
      </View>
    );
  }

  const sections = [];

  // Top tracks section
  if (topTracks && topTracks.length > 0) {
    sections.push({
      id: "top-tracks",
      title: t("music.top_tracks"),
      type: "tracks" as const,
      data: topTracks,
    });
  }

  // Albums section
  if (albums && albums.length > 0) {
    sections.push({
      id: "albums",
      title: t("music.tabs.albums"),
      type: "albums" as const,
      data: albums,
    });
  }

  return (
    <FlashList
      data={sections}
      contentContainerStyle={{
        paddingBottom: insets.bottom + 100,
      }}
      ListHeaderComponent={
        <View
          className='items-center px-4 pb-6 bg-black'
          style={{ paddingTop: insets.top + 50 }}
        >
          {/* Artist image */}
          <View
            style={{
              width: ARTWORK_SIZE,
              height: ARTWORK_SIZE,
              borderRadius: ARTWORK_SIZE / 2,
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
                <Ionicons name='person' size={60} color='#666' />
              </View>
            )}
          </View>

          {/* Artist info */}
          <Text className='text-white text-2xl font-bold mt-4 text-center'>
            {artist.Name}
          </Text>
          <Text className='text-neutral-500 text-sm mt-1'>
            {albums?.length || 0} {t("music.tabs.albums").toLowerCase()}
          </Text>

          {/* Play button */}
          {topTracks && topTracks.length > 0 && (
            <TouchableOpacity
              onPress={handlePlayAllTracks}
              className='flex flex-row items-center bg-purple-600 px-6 py-3 rounded-full mt-4'
            >
              <Ionicons name='play' size={20} color='white' />
              <Text className='text-white font-medium ml-2'>
                {t("music.play_top_tracks")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      }
      renderItem={({ item: section }) => (
        <View className='mb-6'>
          <Text className='text-lg font-bold px-4 mb-3'>{section.title}</Text>
          {section.type === "albums" ? (
            <HorizontalScroll
              data={section.data}
              height={200}
              keyExtractor={(item) => item.Id!}
              renderItem={(item) => <MusicAlbumCard album={item} />}
            />
          ) : (
            section.data
              .slice(0, 5)
              .map((track, index) => (
                <MusicTrackItem
                  key={track.Id}
                  track={track}
                  index={index + 1}
                  queue={section.data}
                />
              ))
          )}
        </View>
      )}
      keyExtractor={(item) => item.id}
    />
  );
}
