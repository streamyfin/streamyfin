import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { AlbumCard } from "@/components/music/AlbumCard";
import { MusicListScreen } from "@/components/music/MusicListScreen";
import type { Playlist } from "@/models/music/types";
import { useMusicApi } from "@/providers/MediaApiProvider";

export default function PlaylistsListScreen() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const musicApi = useMusicApi();

  const fetchPlaylists = useCallback(
    async ({
      libraryId: libId,
      startIndex,
      limit,
    }: {
      libraryId: string | undefined;
      searchTerm?: string;
      startIndex: number;
      limit?: number;
    }) => {
      return musicApi.getPlaylists({
        libraryId: libId,
        startIndex,
        limit,
      });
    },
    [musicApi],
  );

  const renderPlaylist = useCallback(
    (playlist: Playlist, itemSize: number) => (
      // Playlists share similar structure with Albums, reuse AlbumCard
      <AlbumCard album={playlist as any} itemSize={itemSize} />
    ),
    [],
  );

  return (
    <MusicListScreen<Playlist>
      title='Playlists'
      queryKeyPrefix='music-playlists'
      libraryId={libraryId}
      fetchFn={fetchPlaylists}
      renderItem={renderPlaylist}
      keyExtractor={(item) => item.id}
      alwaysPaginate
    />
  );
}
