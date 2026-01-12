import { useSegments } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import { TouchableOpacity, type ViewProps } from "react-native";
import GenericSlideCard from "@/components/seerr/discover/GenericSlideCard";
import Slide, { type SlideProps } from "@/components/seerr/discover/Slide";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import {
  COMPANY_LOGO_IMAGE_FILTER,
  type Network,
} from "@/utils/jellyseerr/src/components/Discover/NetworkSlider";
import type { Studio } from "@/utils/jellyseerr/src/components/Discover/StudioSlider";

const CompanySlide: React.FC<
  { data: Network[] | Studio[] } & SlideProps & ViewProps
> = ({ slide, data, ...props }) => {
  const segments = useSegments();
  const { seerrApi } = useSeerr();
  const router = useRouter();
  const from = (segments as string[])[2] || "(home)";

  const navigate = useCallback(
    ({ id, image, name }: Network | Studio) =>
      router.push({
        pathname: `/(auth)/(tabs)/${from}/seerr/company/${id}` as any,
        params: { id, image, name, type: slide.type },
      }),
    [slide],
  );

  return (
    <Slide
      {...props}
      slide={slide}
      data={data}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(item, _index) => (
        <TouchableOpacity className='mr-2' onPress={() => navigate(item)}>
          <GenericSlideCard
            className='w-28 rounded-lg overflow-hidden border border-neutral-900 p-4'
            id={item.id.toString()}
            url={seerrApi?.imageProxy(item.image, COMPANY_LOGO_IMAGE_FILTER)}
          />
        </TouchableOpacity>
      )}
    />
  );
};

export default CompanySlide;
