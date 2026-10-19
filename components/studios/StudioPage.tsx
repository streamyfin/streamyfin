import { FlashList } from "@shopify/flash-list";
import { useNavigation } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCardGrid } from "@/components/cards/useCardGrid";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { useStudioItems } from "@/hooks/useStudioItems";

const COLUMNS = 3;

/** A studio's movies and series as a poster grid, titled with its name. */
export const StudioPage: React.FC<{ studioId: string }> = ({ studioId }) => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { studio, items, isLoading, loadMore } = useStudioItems(studioId);

  useEffect(() => {
    navigation.setOptions({ title: studio?.Name ?? "" });
  }, [navigation, studio?.Name]);

  const grid = useCardGrid({
    items,
    columns: COLUMNS,
    enableActionSheet: true,
  });

  if (isLoading) {
    return (
      <View className='w-full h-full flex items-center justify-center'>
        <Loader />
      </View>
    );
  }

  return (
    <>
      <FlashList
        ListEmptyComponent={
          <View className='flex flex-col items-center justify-center h-full'>
            <Text className='font-bold text-xl text-neutral-500'>
              {t("search.no_results")}
            </Text>
          </View>
        }
        contentInsetAdjustmentBehavior='automatic'
        data={grid.data}
        renderItem={grid.renderItem}
        keyExtractor={grid.keyExtractor}
        numColumns={COLUMNS}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        // The grid sizes its cards for the width between the side insets.
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: 24,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        ItemSeparatorComponent={() => <View style={{ height: grid.rowGap }} />}
      />
      {grid.actionSheet}
    </>
  );
};
