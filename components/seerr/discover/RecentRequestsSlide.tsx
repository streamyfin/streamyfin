import { useQuery } from "@tanstack/react-query";
import type React from "react";
import type { ViewProps } from "react-native";
import { RequestCard } from "@/components/seerr/discover/RequestCard";
import Slide, { type SlideProps } from "@/components/seerr/discover/Slide";
import { useSeerr } from "@/hooks/useSeerr";
import type { MediaRequest } from "@/utils/seerr/types";

/**
 * Seerr's recent requests row (RecentRequestsSlider): the ten requests added
 * last, each as Seerr's request card.
 */
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
