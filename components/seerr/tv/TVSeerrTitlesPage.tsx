import type React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Loader } from "@/components/Loader";
import { TVSeerrPosterCard } from "@/components/tv/TVSeerrPosterCard";
import { useScaledTVSizes } from "@/constants/TVSizes";
import useRouter from "@/hooks/useAppRouter";
import {
  type SeerrTitlesSource,
  useSeerrDiscoverTitles,
} from "@/hooks/useSeerrDiscoverTitles";

// How close to the end of the grid the next page is asked for.
const LOAD_MORE_DISTANCE = 600;
const ITEM_GAP = 20;

/**
 * A genre's, a network's or a studio's titles on the TV, the phone's page
 * (ParallaxSlideShow) laid out for the remote: its name or logo, then its
 * posters in a grid that grows as it is scrolled.
 */
export const TVSeerrTitlesPage: React.FC<{
  source: SeerrTitlesSource;
  heading: React.ReactNode;
}> = ({ source, heading }) => {
  const insets = useSafeAreaInsets();
  const sizes = useScaledTVSizes();
  const router = useRouter();
  const { titles, loadMore, isLoading } = useSeerrDiscoverTitles(source);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: insets.top + 100,
        paddingBottom: insets.bottom + 60,
        paddingHorizontal: sizes.padding.horizontal,
      }}
      scrollEventThrottle={64}
      onScroll={({
        nativeEvent: { layoutMeasurement, contentOffset, contentSize },
      }) => {
        if (
          layoutMeasurement.height + contentOffset.y >=
          contentSize.height - LOAD_MORE_DISTANCE
        )
          loadMore();
      }}
    >
      <View style={{ marginBottom: 40 }}>{heading}</View>
      {isLoading ? (
        <Loader />
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: ITEM_GAP,
          }}
        >
          {titles.map((item, index) => (
            <TVSeerrPosterCard
              key={item.id}
              item={item}
              hasTVPreferredFocus={index === 0}
              onPress={() =>
                router.push({
                  pathname: "/(auth)/(tabs)/(search)/seerr/page",
                  params: { id: String(item.id), mediaType: item.mediaType },
                })
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
};
