import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { AlbumCard } from "@/components/music/AlbumCard";
import { MusicListScreen } from "@/components/music/MusicListScreen";
import type { Album } from "@/models/music/types";
import { useMusicApi } from "@/providers/MediaApiProvider";

export default function AlbumsListScreen() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const musicApi = useMusicApi();

  const fetchAlbums = useCallback(
    async ({
      libraryId: libId,
      searchTerm,
      startIndex,
      limit,
    }: {
      libraryId: string | undefined;
      searchTerm?: string;
      startIndex: number;
      limit?: number;
    }) => {
      return musicApi.getAlbums({
        libraryId: libId,
        searchTerm,
        startIndex,
        limit,
      });
    },
    [musicApi],
  );

  const renderAlbum = useCallback(
    (album: Album, itemSize: number) => (
      <AlbumCard album={album} itemSize={itemSize} />
    ),
    [],
  );

  return (
    <MusicListScreen<Album>
      title='Albums'
      queryKeyPrefix='music-albums'
      libraryId={libraryId}
      fetchFn={fetchAlbums}
      renderItem={renderAlbum}
      keyExtractor={(item) => item.id}
      searchEnabled
      searchPlaceholder='Search albums...'
      alphabetScrollEnabled
      getJellyfinItem={(item) => item.jellyfinItem}
    />
  );
}
