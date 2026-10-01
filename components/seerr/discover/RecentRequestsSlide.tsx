import { useQuery } from "@tanstack/react-query";
import type React from "react";
import type { ViewProps } from "react-native";
import SeerrPoster from "@/components/posters/SeerrPoster";
import Slide, { type SlideProps } from "@/components/seerr/discover/Slide";
import { useSeerr } from "@/hooks/useSeerr";
import type { MediaRequest } from "@/utils/seerr/types";
import { MediaType } from "@/utils/seerr/types";

const RequestCard: React.FC<{ request: MediaRequest }> = ({ request }) => {
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
        data={requests.results}
        keyExtractor={(item) => item.id.toString()}
        renderItem={(item: MediaRequest) => <RequestCard request={item} />}
      />
    )
  );
};

export default RecentRequestsSlide;
