import type React from "react";
import { useTranslation } from "react-i18next";
import { TVSeerrRow } from "@/components/seerr/discover/TVSeerrRow";
import { TVSeerrSlideCard } from "@/components/seerr/tv/TVSeerrSlideCard";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import {
  COMPANY_LOGO_IMAGE_FILTER,
  type Network,
  type Studio,
} from "@/utils/seerr/data";
import { type DiscoverSlider, DiscoverSliderType } from "@/utils/seerr/types";

/**
 * Seerr's networks or studios row on the TV, as the phone has it
 * (CompanySlide): each company's logo, leading to its titles.
 */
export const TVCompanySlide: React.FC<{
  slide: DiscoverSlider;
  data: Network[] | Studio[];
  isFirstSlide?: boolean;
}> = ({ slide, data, isFirstSlide = false }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { seerrApi } = useSeerr();

  return (
    <TVSeerrRow<Network | Studio>
      title={t(
        `search.${DiscoverSliderType[slide.type].toString().toLowerCase()}`,
      )}
      data={data}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(company, index) => (
        <TVSeerrSlideCard
          contentFit='contain'
          hasTVPreferredFocus={isFirstSlide && index === 0}
          imageUrl={seerrApi?.imageProxy(
            company.image,
            COMPANY_LOGO_IMAGE_FILTER,
          )}
          onPress={() =>
            router.push({
              pathname: "/(auth)/(tabs)/(search)/seerr/company/[companyId]",
              params: {
                companyId: String(company.id),
                id: String(company.id),
                image: company.image,
                name: company.name,
                type: slide.type,
              },
            })
          }
        />
      )}
    />
  );
};
