import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { Loader } from "@/components/Loader";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import {
  TV_GRID_LOAD_MORE_DISTANCE,
  useScaledTVSizes,
} from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useStudioItems } from "@/hooks/useStudioItems";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { scaleSize } from "@/utils/scaleSize";

// The room every TV page leaves above and below its content, and under a
// page's heading.
const TOP_PADDING = 100;
const BOTTOM_PADDING = 60;
const HEADING_GAP = 40;

/**
 * A studio's movies and series on the TV: its name, then the posters in a
 * grid that grows as it is scrolled. The grid wraps in a ScrollView rather
 * than a FlatList with columns, which sizes its cells unevenly.
 */
export const TVStudioPage: React.FC<{ studioId: string }> = ({ studioId }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const sizes = useScaledTVSizes();
  const typography = useScaledTVTypography();
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
  const { studio, items, isLoading, loadMore } = useStudioItems(studioId);

  // The next page is asked for as the grid is scrolled, and a page that does
  // not fill the screen cannot be: at the smallest poster size one page of
  // posters fits on it. So a grid that is not taller than the screen asks by
  // itself, a page at a time, until it is or there is nothing left.
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  useEffect(() => {
    if (viewportHeight > 0 && contentHeight > 0) {
      if (contentHeight <= viewportHeight) loadMore();
    }
  }, [viewportHeight, contentHeight, loadMore]);

  return (
    <ScrollView
      testID='studio-grid'
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
      onContentSizeChange={(_width, height) => setContentHeight(height)}
      contentContainerStyle={{
        paddingTop: insets.top + TOP_PADDING,
        paddingBottom: insets.bottom + BOTTOM_PADDING,
        paddingHorizontal: sizes.padding.horizontal,
      }}
      scrollEventThrottle={64}
      onScroll={({
        nativeEvent: { layoutMeasurement, contentOffset, contentSize },
      }) => {
        if (
          layoutMeasurement.height + contentOffset.y >=
          contentSize.height - scaleSize(TV_GRID_LOAD_MORE_DISTANCE)
        )
          loadMore();
      }}
    >
      <Text
        style={{
          fontSize: typography.title,
          fontWeight: "bold",
          color: "white",
          textAlign: "center",
          marginBottom: HEADING_GAP,
        }}
      >
        {studio?.Name}
      </Text>
      {isLoading ? (
        <Loader />
      ) : items.length === 0 ? (
        <Text
          style={{
            fontSize: typography.body,
            color: "#737373",
            textAlign: "center",
          }}
        >
          {t("search.no_results")}
        </Text>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: sizes.gaps.item,
          }}
        >
          {items.map((item, index) => (
            <TVPosterCard
              key={item.Id}
              item={item}
              orientation='vertical'
              // The grid is the only focusable zone, so its first poster
              // takes the initial focus.
              hasTVPreferredFocus={index === 0}
              onPress={() =>
                router.push(getItemNavigation(item, "(search)") as any)
              }
              onLongPress={() => showItemActions(item)}
              width={sizes.posters.poster}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
};
