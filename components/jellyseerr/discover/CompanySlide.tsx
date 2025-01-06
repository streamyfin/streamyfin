import React, {useCallback} from "react";
import {
  useJellyseerr,
} from "@/hooks/useJellyseerr";
import {TouchableOpacity, ViewProps} from "react-native";
import Slide, {SlideProps} from "@/components/jellyseerr/discover/Slide";
import {COMPANY_LOGO_IMAGE_FILTER, Network} from "@/utils/jellyseerr/src/components/Discover/NetworkSlider";
import GenericSlideCard from "@/components/jellyseerr/discover/GenericSlideCard";
import {Studio} from "@/utils/jellyseerr/src/components/Discover/StudioSlider";
import {router, useSegments} from "expo-router";

const CompanySlide: React.FC<{data: Network[] | Studio[]} & SlideProps & ViewProps> = ({ slide, data, ...props }) => {
  const segments = useSegments();
  const { jellyseerrApi } = useJellyseerr();
  const from = segments[2];

  const navigate = useCallback(({id, image, name}: Network | Studio) => router.push({
    pathname: `/(auth)/(tabs)/${from}/jellyseerr/company/${id}`,
    params: {id, image, name, type: slide.type }
  }), [slide]);

  return (
    <Slide
      {...props}
      slide={slide}
      data={data}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(item, index) => (
        <TouchableOpacity className="mr-2" onPress={() => navigate(item)}>
          <GenericSlideCard
            className="w-28 rounded-lg overflow-hidden border border-neutral-900 p-4"
            id={item.id.toString()}
            url={jellyseerrApi?.imageProxy(item.image, COMPANY_LOGO_IMAGE_FILTER)}
          />
        </TouchableOpacity>
      )}
    />
  );
};

export default CompanySlide;
