import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useRoute } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HorizontalScroll } from "@/components/common/HorizontalScroll";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { CreatePlaylistModal } from "@/components/music/CreatePlaylistModal";
import { MusicAlbumCard } from "@/components/music/MusicAlbumCard";
import { MusicTrackItem } from "@/components/music/MusicTrackItem";
import { PlaylistPickerSheet } from "@/components/music/PlaylistPickerSheet";
import { TrackOptionsSheet } from "@/components/music/TrackOptionsSheet";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { writeDebugLog } from "@/utils/log";

export default function SuggestionsScreen() {
  const localParams = useLocalSearchParams<{ libraryId?: string | string[] }>();
  const route = useRoute<any>();
  const libraryId =
    (Array.isArray(localParams.libraryId)
      ? localParams.libraryId[0]
      : localParams.libraryId) ?? route?.params?.libraryId;
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

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

  const isReady = Boolean(api && user?.Id && libraryId);

  writeDebugLog("Music suggestions params", {
    libraryId,
    localParams,
    routeParams: route?.params,
    isReady,
  });

  // Latest audio - uses the same endpoint as web: /Users/{userId}/Items/Latest
  // This returns the most recently added albums
  const {
    data: latestAlbums,
    isLoading: loadingLatest,
    isError: isLatestError,
    error: latestError,
    refetch: refetchLatest,
  } = useQuery({
    queryKey: ["music-latest", libraryId, user?.Id],
    queryFn: async () => {
      // Prefer the exact endpoint the Web client calls (HAR):
      // /Users/{userId}/Items/Latest?IncludeItemTypes=Audio&ParentId=...
      // IMPORTANT: must use api.get(...) (not axiosInstance.get(fullUrl)) so the auth header is attached.
      const res = await api!.get<BaseItemDto[]>(
        `/Users/${user!.Id}/Items/Latest`,
        {
          params: {
            IncludeItemTypes: "Audio",
            Limit: 20,
            Fields: "PrimaryImageAspectRatio",
            ParentId: libraryId,
            ImageTypeLimit: 1,
            EnableImageTypes: "Primary,Backdrop,Banner,Thumb",
            EnableTotalRecordCount: false,
          },
        },
      );

      if (Array.isArray(res.data) && res.data.length > 0) {
        return res.data;
      }

      // Fallback: ask for albums directly via /Items (more reliable across server variants)
      const fallback = await getItemsApi(api!).getItems({
        userId: user!.Id,
        parentId: libraryId,
        includeItemTypes: ["MusicAlbum"],
        sortBy: ["DateCreated"],
        sortOrder: ["Descending"],
        limit: 20,
        recursive: true,
        fields: ["PrimaryImageAspectRatio", "SortName"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        enableTotalRecordCount: false,
      });
      return fallback.data.Items || [];
    },
    enabled: isReady,
  });

  // Recently played - matches web: SortBy=DatePlayed, Filters=IsPlayed
  const {
    data: recentlyPlayed,
    isLoading: loadingRecentlyPlayed,
    isError: isRecentlyPlayedError,
    error: recentlyPlayedError,
    refetch: refetchRecentlyPlayed,
  } = useQuery({
    queryKey: ["music-recently-played", libraryId, user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: libraryId,
        includeItemTypes: ["Audio"],
        sortBy: ["DatePlayed"],
        sortOrder: ["Descending"],
        limit: 10,
        recursive: true,
        fields: ["PrimaryImageAspectRatio", "SortName"],
        filters: ["IsPlayed"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        enableTotalRecordCount: false,
      });
      return response.data.Items || [];
    },
    enabled: isReady,
  });

  // Frequently played - matches web: SortBy=PlayCount, Filters=IsPlayed
  const {
    data: frequentlyPlayed,
    isLoading: loadingFrequent,
    isError: isFrequentError,
    error: frequentError,
    refetch: refetchFrequent,
  } = useQuery({
    queryKey: ["music-frequently-played", libraryId, user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: libraryId,
        includeItemTypes: ["Audio"],
        sortBy: ["PlayCount"],
        sortOrder: ["Descending"],
        limit: 10,
        recursive: true,
        fields: ["PrimaryImageAspectRatio", "SortName"],
        filters: ["IsPlayed"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        enableTotalRecordCount: false,
      });
      return response.data.Items || [];
    },
    enabled: isReady,
  });

  const isLoading = loadingLatest || loadingRecentlyPlayed || loadingFrequent;

  const handleRefresh = useCallback(() => {
    refetchLatest();
    refetchRecentlyPlayed();
    refetchFrequent();
  }, [refetchLatest, refetchRecentlyPlayed, refetchFrequent]);

  const sections = useMemo(() => {
    const result: {
      title: string;
      data: BaseItemDto[];
      type: "albums" | "tracks";
    }[] = [];

    // Latest albums section
    if (latestAlbums && latestAlbums.length > 0) {
      result.push({
        title: t("music.recently_added"),
        data: latestAlbums,
        type: "albums",
      });
    }

    // Recently played tracks
    if (recentlyPlayed && recentlyPlayed.length > 0) {
      result.push({
        title: t("music.recently_played"),
        data: recentlyPlayed,
        type: "tracks",
      });
    }

    // Frequently played tracks
    if (frequentlyPlayed && frequentlyPlayed.length > 0) {
      result.push({
        title: t("music.frequently_played"),
        data: frequentlyPlayed,
        type: "tracks",
      });
    }

    return result;
  }, [latestAlbums, frequentlyPlayed, recentlyPlayed, t]);

  if (!api || !user?.Id) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (!libraryId) {
    return (
      <View className='flex-1 justify-center items-center bg-black px-6'>
        <Text className='text-neutral-500 text-center'>
          Missing music library id.
        </Text>
      </View>
    );
  }

  // Only show loading if we have no cached data to display
  if (isLoading && sections.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  // Only show error if we have no cached data to display
  // This allows offline access to previously cached suggestions
  if (
    (isLatestError || isRecentlyPlayedError || isFrequentError) &&
    sections.length === 0
  ) {
    const msg =
      (latestError as Error | undefined)?.message ||
      (recentlyPlayedError as Error | undefined)?.message ||
      (frequentError as Error | undefined)?.message ||
      "Unknown error";
    return (
      <View className='flex-1 justify-center items-center bg-black px-6'>
        <Text className='text-neutral-500 text-center'>
          Failed to load music: {msg}
        </Text>
      </View>
    );
  }

  if (sections.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Text className='text-neutral-500'>{t("music.no_suggestions")}</Text>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <FlashList
        data={sections}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
          paddingTop: 16,
        }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor='#9334E9'
          />
        }
        renderItem={({ item: section }) => (
          <View className='mb-6'>
            <Text className='text-lg font-bold px-4 mb-3'>{section.title}</Text>
            {section.type === "albums" ? (
              <HorizontalScroll
                data={section.data}
                height={178}
                keyExtractor={(item) => item.Id!}
                renderItem={(item) => <MusicAlbumCard album={item} />}
              />
            ) : (
              section.data
                .slice(0, 5)
                .map((track, index, _tracks) => (
                  <MusicTrackItem
                    key={track.Id}
                    track={track}
                    index={index + 1}
                    queue={section.data}
                    onOptionsPress={handleTrackOptionsPress}
                  />
                ))
            )}
          </View>
        )}
        keyExtractor={(item) => item.title}
      />
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
    </View>
  );
}
