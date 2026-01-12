import { useQuery } from "@tanstack/react-query";
import type React from "react";
import type { ViewProps } from "react-native";
import SeerrPoster from "@/components/posters/SeerrPoster";
import Slide, { type SlideProps } from "@/components/seerr/discover/Slide";
import { useSeerr } from "@/hooks/useSeerr";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type { NonFunctionProperties } from "@/utils/jellyseerr/server/interfaces/api/common";

type ExtendedMediaRequest = NonFunctionProperties<MediaRequest> & {
  profileName: string;
  canRemove: boolean;
};

const RequestCard: React.FC<{ request: ExtendedMediaRequest }> = ({
  request,
}) => {
  const { seerrApi } = useSeerr();

  const { data: details } = useQuery({
    queryKey: [
      "seerr",
      "detail",
      request.media.mediaType,
      request.media.tmdbId,
    ],
    queryFn: async () => {
      return request.media.mediaType === MediaType.MOVIE
        ? seerrApi?.movieDetails(request.media.tmdbId)
        : seerrApi?.tvDetails(request.media.tmdbId);
    },
    enabled: !!seerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });

  const { data: refreshedRequest } = useQuery({
    queryKey: ["seerr", "requests", request.media.mediaType, request.id],
    queryFn: async () => seerrApi?.getRequest(request.id),
    enabled: !!seerrApi,
    refetchOnMount: true,
    refetchInterval: 5000,
    staleTime: 0,
  });

  return (
    <SeerrPoster
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
  const { seerrApi } = useSeerr();

  const { data: requests } = useQuery({
    queryKey: ["seerr", "recent_requests"],
    queryFn: async () => seerrApi?.requests(),
    enabled: !!seerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });

  return (
    requests &&
    requests.results.length > 0 && (
      <Slide
        {...props}
        slide={slide}
        data={
          requests.results.map((item) => ({
            ...item,
            profileName: item.profileName ?? "Unknown",
            canRemove: Boolean(item.canRemove),
          })) as ExtendedMediaRequest[]
        }
        keyExtractor={(item) => item.id.toString()}
        renderItem={(item: ExtendedMediaRequest) => (
          <RequestCard request={item} />
        )}
      />
    )
  );
};

export default RecentRequestsSlide;
