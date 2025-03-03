import React from "react";
import {useQuery} from "@tanstack/react-query";
import {useJellyseerr} from "@/hooks/useJellyseerr";
import Slide, {SlideProps} from "@/components/jellyseerr/discover/Slide";
import {ViewProps} from "react-native";
import MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import {NonFunctionProperties} from "@/utils/jellyseerr/server/interfaces/api/common";
import {MediaType} from "@/utils/jellyseerr/server/constants/media";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";

const RequestCard: React.FC<{request: MediaRequest}> = ({request}) => {
  const {jellyseerrApi} = useJellyseerr();

  const { data: details, isLoading, isError } = useQuery({
    queryKey: ["jellyseerr", "detail", request.media.mediaType, request.media.tmdbId],
    queryFn: async () => {

      return request.media.mediaType == MediaType.MOVIE
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
    !isLoading && details && <JellyseerrPoster horizontal showDownloadInfo item={details} mediaRequest={refreshedRequest} />
  )
}

const RecentRequestsSlide: React.FC<SlideProps & ViewProps> = ({ slide, ...props }) => {
  const {jellyseerrApi} = useJellyseerr();

  const { data: requests, isLoading, isError } = useQuery({
    queryKey: ["jellyseerr", "recent_requests"],
    queryFn: async () =>  jellyseerrApi?.requests(),
    enabled: !!jellyseerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });

  return (
    requests &&
    requests.results.length > 0 &&
    !isError && (
      <Slide
        {...props}
        slide={slide}
        data={requests.results}
        keyExtractor={(item) => item.id.toString()}
        renderItem={(item: NonFunctionProperties<MediaRequest>) => (
          <RequestCard request={item}/>
        )}
      />
    )
  )
};

export default RecentRequestsSlide;