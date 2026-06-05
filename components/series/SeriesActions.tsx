import { Ionicons } from "@expo/vector-icons";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Linking,
  TouchableOpacity,
  View,
  type ViewProps,
} from "react-native";
import ReportIssueModal from "@/components/jellyseerr/ReportIssueModal";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";

interface Props extends ViewProps {
  item: BaseItemDto | MovieDetails | TvDetails;
}

// Type guards
const isJellyseerrMovie = (item: any): item is MovieDetails =>
  "title" in item && "mediaInfo" in item && !("name" in item);

const isJellyseerrTv = (item: any): item is TvDetails =>
  "name" in item && "mediaInfo" in item && "numberOfSeasons" in item;

const isJellyfinItem = (item: any): item is BaseItemDto =>
  "Type" in item && "Id" in item;

export const ItemActions = ({ item, ...props }: Props) => {
  const { t } = useTranslation();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { jellyseerrApi, jellyseerrUser } = useJellyseerr();
  const reportModalRef = useRef<BottomSheetModal>(null);

  // For episodes, we need to fetch the parent series to get its TMDB ID
  const isEpisode = isJellyfinItem(item) && item.Type === "Episode";
  const seriesId = isEpisode ? item.SeriesId : undefined;

  // Fetch parent series for episodes (to get series TMDB ID)
  const { data: seriesData } = useQuery({
    queryKey: ["jellyfin", "series", seriesId],
    queryFn: async () => {
      if (!api || !seriesId) return null;
      try {
        const response = await getUserLibraryApi(api).getItem({
          itemId: seriesId,
          userId: user?.Id,
        });
        return response.data;
      } catch (error) {
        console.debug("Failed to fetch series for episode:", error);
        return null;
      }
    },
    enabled: !!api && !!seriesId && isEpisode,
    staleTime: (10).minutesToMilliseconds(),
  });

  // Extract TMDB ID - for episodes, use the series' TMDB ID
  const tmdbId = useMemo(() => {
    if (isJellyfinItem(item)) {
      // For episodes, use the parent series' TMDB ID
      if (isEpisode && seriesData?.ProviderIds?.Tmdb) {
        return Number(seriesData.ProviderIds.Tmdb);
      }
      // For other items, use their own TMDB ID
      const tmdb = item.ProviderIds?.Tmdb;
      return tmdb ? Number(tmdb) : undefined;
    }
    // For Jellyseerr items, use the item id (which is the TMDB id)
    return (item as MovieDetails | TvDetails).id;
  }, [item, isEpisode, seriesData]);

  // Determine media type
  const mediaType = useMemo((): "movie" | "tv" | undefined => {
    if (isJellyseerrMovie(item)) return "movie";
    if (isJellyseerrTv(item)) return "tv";
    if (isJellyfinItem(item)) {
      const type = item.Type;
      if (type === "Movie") return "movie";
      if (type === "Series" || type === "Season" || type === "Episode")
        return "tv";
    }
    return undefined;
  }, [item]);

  // Fetch Jellyseerr details for Jellyfin items (to get mediaInfo.id)
  const { data: jellyseerrDetails } = useQuery({
    queryKey: ["jellyseerr", "details", mediaType, tmdbId],
    queryFn: async () => {
      if (!tmdbId || !mediaType || !jellyseerrApi) return null;
      try {
        if (mediaType === "movie") {
          return await jellyseerrApi.movieDetails(tmdbId);
        }
        return await jellyseerrApi.tvDetails(tmdbId);
      } catch (error) {
        // Silently fail - media might not exist in Jellyseerr yet
        console.debug("Failed to fetch Jellyseerr details:", error);
        return null;
      }
    },
    enabled:
      !!jellyseerrApi &&
      !!jellyseerrUser &&
      !!tmdbId &&
      !!mediaType &&
      isJellyfinItem(item),
    staleTime: (5).minutesToMilliseconds(),
    retry: false,
  });

  // Get the Jellyseerr internal media ID
  const jellyseerrMediaId = useMemo(() => {
    if (isJellyseerrMovie(item) || isJellyseerrTv(item)) {
      return item.mediaInfo?.id;
    }
    return jellyseerrDetails?.mediaInfo?.id;
  }, [item, jellyseerrDetails]);

  // Get title for the modal - for episodes, show series name
  const mediaTitle = useMemo(() => {
    if (isJellyseerrMovie(item)) return item.title;
    if (isJellyseerrTv(item)) return item.name;
    if (isJellyfinItem(item)) {
      if (item.Type === "Episode") {
        return item.SeriesName || item.Name || "";
      }
      return item.Name || "";
    }
    return "";
  }, [item]);

  // Get total seasons for TV shows
  const totalSeasons = useMemo(() => {
    if (isJellyseerrTv(item)) return item.numberOfSeasons;
    if (jellyseerrDetails && "numberOfSeasons" in jellyseerrDetails) {
      return jellyseerrDetails.numberOfSeasons;
    }
    return undefined;
  }, [item, jellyseerrDetails]);

  // Get pre-filled season/episode for context
  const seasonContext = useMemo(() => {
    if (isJellyfinItem(item)) {
      if (item.Type === "Season") {
        return item.IndexNumber ?? undefined;
      }
      if (item.Type === "Episode") {
        return item.ParentIndexNumber ?? undefined;
      }
    }
    return undefined;
  }, [item]);

  const episodeContext = useMemo(() => {
    if (isJellyfinItem(item) && item.Type === "Episode") {
      return item.IndexNumber ?? undefined;
    }
    return undefined;
  }, [item]);

  const trailerLink = useMemo(() => {
    if ("RemoteTrailers" in item && item.RemoteTrailers?.[0]?.Url) {
      return item.RemoteTrailers[0].Url;
    }

    if ("relatedVideos" in item) {
      return item.relatedVideos?.find((v) => v.type === "Trailer")?.url;
    }

    return undefined;
  }, [item]);

  const openTrailer = useCallback(async () => {
    if (!trailerLink) {
      Alert.alert(t("common.no_trailer_available"));
      return;
    }

    try {
      await Linking.openURL(trailerLink);
    } catch (err) {
      console.error("Failed to open trailer link:", err);
    }
  }, [trailerLink, t]);

  const canReportIssue =
    !!jellyseerrApi && !!jellyseerrUser && !!jellyseerrMediaId && !!mediaType;

  return (
    <View className='flex-row items-center gap-3' {...props}>
      {canReportIssue && (
        <TouchableOpacity onPress={() => reportModalRef.current?.present()}>
          <Ionicons name='alert-circle-outline' size={24} color='#EAB308' />
        </TouchableOpacity>
      )}
      {trailerLink && (
        <TouchableOpacity onPress={openTrailer}>
          <Ionicons name='film-outline' size={24} color='white' />
        </TouchableOpacity>
      )}
      {canReportIssue && jellyseerrMediaId && mediaType && (
        <ReportIssueModal
          ref={reportModalRef}
          mediaId={jellyseerrMediaId}
          mediaType={mediaType}
          title={mediaTitle}
          seasonNumber={seasonContext}
          episodeNumber={episodeContext}
          totalSeasons={totalSeasons}
        />
      )}
    </View>
  );
};
