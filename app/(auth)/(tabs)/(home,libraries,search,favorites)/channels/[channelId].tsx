import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { ItemCardText } from "@/components/ItemCardText";
import { Loader } from "@/components/Loader";
import { ItemPoster } from "@/components/posters/ItemPoster";
import {
  flattenChannelItems,
  useChannel,
  useChannelItems,
} from "@/hooks/useChannels";
import { useOrientation } from "@/hooks/useOrientation";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const ChannelPage: React.FC = () => {
  const searchParams = useLocalSearchParams();
  const { channelId } = searchParams as { channelId: string };

  const [_api] = useAtom(apiAtom);
  const [_user] = useAtom(userAtom);
  const navigation = useNavigation();
  const { width: screenWidth } = useWindowDimensions();
  const { orientation } = useOrientation();

  const { t } = useTranslation();

  const { data: channel, isLoading: isChannelLoading } = useChannel(channelId);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading: isItemsLoading,
  } = useChannelItems({
    channelId,
  });

  useEffect(() => {
    navigation.setOptions({ title: channel?.Name || t("channels.title") });
  }, [navigation, channel, t]);

  const nrOfCols = useMemo(() => {
    if (screenWidth < 300) return 2;
    if (screenWidth < 500) return 3;
    if (screenWidth < 800) return 5;
    if (screenWidth < 1000) return 6;
    if (screenWidth < 1500) return 7;
    return 6;
  }, [screenWidth, orientation]);

  const flatData = useMemo(() => flattenChannelItems(data), [data]);

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => (
      <TouchableItemRouter
        key={item.Id}
        style={{
          width: "100%",
          marginBottom: 4,
        }}
        item={item}
      >
        <View
          style={{
            alignSelf:
              orientation === ScreenOrientation.OrientationLock.PORTRAIT_UP
                ? index % nrOfCols === 0
                  ? "flex-end"
                  : (index + 1) % nrOfCols === 0
                    ? "flex-start"
                    : "center"
                : "center",
            width: "89%",
          }}
        >
          <ItemPoster item={item} />
          <ItemCardText item={item} />
        </View>
      </TouchableItemRouter>
    ),
    [orientation, nrOfCols],
  );

  const keyExtractor = useCallback((item: BaseItemDto) => item.Id || "", []);

  const insets = useSafeAreaInsets();

  if (isChannelLoading || isItemsLoading) {
    return (
      <View className='w-full h-full flex items-center justify-center'>
        <Loader />
      </View>
    );
  }

  return (
    <FlashList
      key={orientation}
      ListEmptyComponent={
        <View className='flex flex-col items-center justify-center h-full mt-20'>
          <Text className='font-bold text-xl text-neutral-500'>
            {t("channels.empty")}
          </Text>
        </View>
      }
      contentInsetAdjustmentBehavior='automatic'
      data={flatData}
      renderItem={renderItem}
      extraData={[orientation, nrOfCols]}
      keyExtractor={keyExtractor}
      numColumns={nrOfCols}
      onEndReached={() => {
        if (hasNextPage) {
          fetchNextPage();
        }
      }}
      onEndReachedThreshold={1}
      contentContainerStyle={{
        paddingBottom: 24,
        paddingLeft: insets.left + 17,
        paddingRight: insets.right + 17,
        paddingTop: 17,
      }}
      ItemSeparatorComponent={() => (
        <View
          style={{
            width: 10,
            height: 10,
          }}
        />
      )}
    />
  );
};

export default ChannelPage;
