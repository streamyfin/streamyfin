import Slide, { type SlideProps } from "@/components/jellyseerr/discover/Slide";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type { NonFunctionProperties } from "@/utils/jellyseerr/server/interfaces/api/common";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import type { ViewProps } from "react-native";

const RequestCard: React.FC<{ request: MediaRequest }> = ({ request }) => {
  const { jellyseerrApi } = useJellyseerr();

  const {
    data: details,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [
      "jellyseerr",
      "detail",
      request.media.mediaType,
      request.media.tmdbId,
    ],
    queryFn: async () => {
      return request.media.mediaType === MediaType.MOVIE
        ? jellyseerrApi?.movieDetails(request.media.tmdbId)
        : jellyseerrApi?.tvDetails(request.media.tmdbId);
    },
    enabled: !!jellyseerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });

  const { data: refreshedRequest } = useQuery({
    queryKey: ["jellyseerr", "requests", request.media.mediaType, request.id],
    queryFn: async () => jellyseerrApi?.getRequest(request.id),
    enabled: !!jellyseerrApi,
    refetchOnMount: true,
    refetchInterval: 5000,
    staleTime: 0,
  });

  return (
    <JellyseerrPoster
      horizontal
      showDownloadInfo
      item={details}
      mediaRequest={refreshedRequest}
    />
  );
};

const RecentRequestsSlide: React.FC<SlideProps & ViewProps> = ({
  slide,
  ...props
}) => {
  const { jellyseerrApi } = useJellyseerr();

  const {
    data: requests,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["jellyseerr", "recent_requests"],
    queryFn: async () => jellyseerrApi?.requests(),
    enabled: !!jellyseerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });

  return (
    requests &&
    requests.results.length > 0 && (
      <Slide
        {...props}
        slide={slide}
        data={requests.results}
        keyExtractor={(item) => item.id.toString()}
        renderItem={(item: NonFunctionProperties<MediaRequest>) => (
          <RequestCard request={item} />
        )}
      />
    )
  );
};

export default RecentRequestsSlide;
