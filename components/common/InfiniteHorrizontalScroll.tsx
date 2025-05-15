import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList, type FlashListProps } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { t } from "i18next";
import { useAtom } from "jotai";
import React, { useEffect, useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Loader } from "../Loader";
import { Text } from "./Text";

interface HorizontalScrollProps
  extends Omit<FlashListProps<BaseItemDto>, "renderItem" | "data" | "style"> {
  queryFn: ({
    pageParam,
  }: {
    pageParam: number;
  }) => Promise<BaseItemDtoQueryResult | null>;
  queryKey: string[];
  initialData?: BaseItemDto[];
  renderItem: (item: BaseItemDto, index: number) => React.ReactNode;
  containerStyle?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  loadingContainerStyle?: ViewStyle;
  height?: number;
  loading?: boolean;
}

export function InfiniteHorizontalScroll({
  queryFn,
  queryKey,
  initialData = [],
  renderItem,
  containerStyle,
  contentContainerStyle,
  loadingContainerStyle,
  loading = false,
  height = 164,
  ...props
}: HorizontalScrollProps): React.ReactElement {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const animatedOpacity = useSharedValue(0);
  const animatedStyle1 = useAnimatedStyle(() => {
    return {
      opacity: withTiming(animatedOpacity.value, { duration: 250 }),
    };
  });

  const { data, isFetching, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey,
    queryFn,
    getNextPageParam: (lastPage, pages) => {
      if (
        !lastPage?.Items ||
        !lastPage?.TotalRecordCount ||
        lastPage?.TotalRecordCount === 0
      )
        return undefined;

      const totalItems = lastPage.TotalRecordCount;
      const accumulatedItems = pages.reduce(
        (acc, curr) => acc + (curr?.Items?.length || 0),
        0,
      );

      if (accumulatedItems < totalItems) {
        return lastPage?.Items?.length * pages.length;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!api && !!user?.Id,
  });

  const flatData = useMemo(() => {
    return (
      (data?.pages.flatMap((p) => p?.Items).filter(Boolean) as BaseItemDto[]) ||
      []
    );
  }, [data]);

  useEffect(() => {
    if (data) {
      animatedOpacity.value = 1;
    }
  }, [data]);

  if (data === undefined || data === null || loading) {
    return (
      <View
        style={[
          {
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
          },
          loadingContainerStyle,
        ]}
      >
        <Loader />
      </View>
    );
  }

  return (
    <Animated.View style={[containerStyle, animatedStyle1]}>
      <FlashList
        data={flatData}
        renderItem={({ item, index }) => (
          <View className='mr-2'>{renderItem(item, index)}</View>
        )}
        estimatedItemSize={height}
        horizontal
        onEndReached={() => {
          if (hasNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{
          paddingHorizontal: 16,
          ...contentContainerStyle,
        }}
        showsHorizontalScrollIndicator={false}
        ListEmptyComponent={
          <View className='flex-1 justify-center items-center'>
            <Text className='text-center text-gray-500'>
              {t("item_card.no_data_available")}
            </Text>
          </View>
        }
        {...props}
      />
    </Animated.View>
  );
}
