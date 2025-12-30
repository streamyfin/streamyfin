import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ArtistCard } from "@/components/music/ArtistCard";
import { MusicListScreen } from "@/components/music/MusicListScreen";
import type { Artist } from "@/models/music/types";
import { useMusicApi } from "@/providers/MediaApiProvider";

export default function ArtistsListScreen() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const musicApi = useMusicApi();

  const fetchArtists = useCallback(
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
      return musicApi.getArtists({
        libraryId: libId,
        searchTerm,
        startIndex,
        limit,
      });
    },
    [musicApi],
  );

  const renderArtist = useCallback(
    (artist: Artist, itemSize: number) => (
      <ArtistCard artist={artist} itemSize={itemSize} />
    ),
    [],
  );

  return (
    <MusicListScreen<Artist>
      title='Artists'
      queryKeyPrefix='music-artists'
      libraryId={libraryId}
      fetchFn={fetchArtists}
      renderItem={renderArtist}
      keyExtractor={(item) => item.id}
      searchEnabled
      searchPlaceholder='Search artists...'
      alphabetScrollEnabled
      getJellyfinItem={(item) => item.jellyfinItem}
    />
  );
}
