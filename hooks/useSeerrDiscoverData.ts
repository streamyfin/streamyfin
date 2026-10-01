import { useQuery } from "@tanstack/react-query";
import { Endpoints, useSeerr } from "@/hooks/useSeerr";
import { canSeeRecentlyAdded } from "@/utils/seerr/permissions";
import {
  type DiscoverSlider,
  DiscoverSliderType,
  MediaType,
} from "@/utils/seerr/types";

/*
 * What Discover's rows read, for the phone's rows and the TV's alike: one
 * query each, so the two share their cache and their rules.
 */

/** Seerr's recent requests (RecentRequestsSlider): the ten added last. */
export const useSeerrRecentRequests = () => {
  const { seerrApi } = useSeerr();
  return useQuery({
    queryKey: ["seerr", "recent_requests"],
    queryFn: async () => seerrApi?.requests(),
    enabled: !!seerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });
};

/**
 * What the library gained last (RecentlyAddedSlider), for those who manage
 * requests or may see what was added; `visible` false for anyone else.
 */
export const useSeerrRecentlyAdded = () => {
  const { seerrApi, seerrUser } = useSeerr();
  const visible = canSeeRecentlyAdded(seerrUser?.permissions ?? 0);
  const { data: media } = useQuery({
    queryKey: ["seerr", "recently_added"],
    queryFn: async () => seerrApi?.recentlyAdded(),
    enabled: !!seerrApi && visible,
    refetchOnMount: true,
    staleTime: 0,
  });
  return { visible, media };
};

/** A title's details, by its type and TMDB number. */
export const useSeerrTitleDetails = (
  mediaType: string | undefined,
  tmdbId: number | undefined,
) => {
  const { seerrApi } = useSeerr();
  return useQuery({
    queryKey: ["seerr", "detail", mediaType, tmdbId],
    queryFn: async () =>
      mediaType === MediaType.MOVIE
        ? seerrApi?.movieDetails(tmdbId!)
        : seerrApi?.tvDetails(tmdbId!),
    enabled: !!seerrApi && tmdbId !== undefined,
  });
};

/** The film or series genres of a genres row, each with its pictures. */
export const useSeerrGenreSliders = (slide: DiscoverSlider) => {
  const { seerrApi } = useSeerr();
  return useQuery({
    queryKey: ["seerr", "discover", slide.type, slide.id],
    queryFn: async () =>
      seerrApi?.getGenreSliders(
        slide.type === DiscoverSliderType.MOVIE_GENRES
          ? Endpoints.MOVIE
          : Endpoints.TV,
      ),
    enabled: !!seerrApi,
  });
};
