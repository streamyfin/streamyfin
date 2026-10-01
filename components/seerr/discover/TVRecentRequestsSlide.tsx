import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useTranslation } from "react-i18next";
import { TVSeerrRow } from "@/components/seerr/discover/TVSeerrRow";
import { TVRequestCard } from "@/components/seerr/tv/TVRequestCard";
import { useSeerr } from "@/hooks/useSeerr";
import { type DiscoverSlider, DiscoverSliderType } from "@/utils/seerr/types";

/**
 * Seerr's recent requests row (RecentRequestsSlider) on the TV, as the phone
 * has it: the ten requests added last, each as Seerr's request card.
 */
export const TVRecentRequestsSlide: React.FC<{
  slide: DiscoverSlider;
  isFirstSlide?: boolean;
}> = ({ slide, isFirstSlide = false }) => {
  const { t } = useTranslation();
  const { seerrApi } = useSeerr();

  const { data: requests } = useQuery({
    queryKey: ["seerr", "recent_requests"],
    queryFn: async () => seerrApi?.requests(),
    enabled: !!seerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });

  if (!requests?.results.length) return null;

  return (
    <TVSeerrRow
      title={t(
        `search.${DiscoverSliderType[slide.type].toString().toLowerCase()}`,
      )}
      data={requests.results}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(item, index) => (
        <TVRequestCard
          request={item}
          hasTVPreferredFocus={isFirstSlide && index === 0}
        />
      )}
    />
  );
};
