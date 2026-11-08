import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { Linking, Platform } from "react-native";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import {
  pickTrailers,
  type RemoteTrailerLink,
  type Trailer,
} from "@/utils/jellyfin/media/trailers";
import type { MovieDetails, TvDetails } from "@/utils/seerr/types";

export type TrailerSourceItem = BaseItemDto | MovieDetails | TvDetails;

const isJellyfinItem = (item: TrailerSourceItem): item is BaseItemDto =>
  "Id" in item;

const remoteLinksOf = (item: TrailerSourceItem): RemoteTrailerLink[] => {
  if (isJellyfinItem(item)) {
    return (item.RemoteTrailers ?? []).map((t) => ({
      url: t.Url,
      name: t.Name,
    }));
  }
  return (item.relatedVideos ?? [])
    .filter((v) => v.type === "Trailer")
    .map((v) => ({ url: v.url, name: v.name }));
};

/** The item's trailers in the order the trailer source setting asks for. */
export const useTrailers = (item: TrailerSourceItem | null | undefined) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const isOffline = useOfflineMode();
  const { settings } = useSettings();
  const playMedia = usePlayMedia();
  const source = settings.trailerSource;

  const jellyfinItem = item && isJellyfinItem(item) ? item : undefined;
  // The count comes with the item, so most items never make the request.
  const wantsLibrary =
    !isOffline &&
    source !== "remoteOnly" &&
    (jellyfinItem?.LocalTrailerCount ?? 0) > 0;

  const { data: libraryTrailers, isLoading: isLoadingLibraryTrailers } =
    useQuery({
      queryKey: ["localTrailers", jellyfinItem?.Id, user?.Id],
      queryFn: async () => {
        const res = await getLibraryApi(api!).getLocalTrailers({
          itemId: jellyfinItem!.Id!,
          userId: user?.Id,
        });
        return res.data;
      },
      enabled: wantsLibrary && !!api && !!jellyfinItem?.Id,
      staleTime: 5 * 60 * 1000,
    });

  const trailers = useMemo(() => {
    // Both kinds need the network: a library trailer streams from the server.
    if (!item || isOffline) return [];
    // Hold off on the remote fallback while the library lookup is still in
    // flight: LocalTrailerCount already promises a library trailer, and
    // falling back here would let a tap play remote instead of waiting for
    // it. preferRemote asked for the remote one regardless, so it has
    // nothing to wait for.
    if (source !== "preferRemote" && wantsLibrary && isLoadingLibraryTrailers)
      return [];
    return pickTrailers(
      source,
      wantsLibrary ? (libraryTrailers ?? []) : [],
      // tvOS has no browser to hand a YouTube link to.
      Platform.isTV && Platform.OS === "ios" ? [] : remoteLinksOf(item),
    );
  }, [
    item,
    isOffline,
    source,
    wantsLibrary,
    libraryTrailers,
    isLoadingLibraryTrailers,
  ]);

  const playTrailer = useCallback(
    async (trailer: Trailer) => {
      if (trailer.source === "library") {
        await playMedia(
          { itemId: trailer.id, offline: false, playbackPositionTicks: 0 },
          { item: trailer.item },
        );
        return;
      }
      try {
        await Linking.openURL(trailer.url);
      } catch (err) {
        console.error("Failed to open trailer link:", err);
      }
    },
    [playMedia],
  );

  return { trailers, playTrailer };
};
