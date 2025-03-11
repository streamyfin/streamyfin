import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  BaseItemDto,
  BaseItemDtoQueryResult,
} from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList, FlashListProps } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, ViewStyle, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Loader } from "../Loader";
import { Text } from "./Text";
import { t } from "i18next";

// Check if we're running on a TV platform
const isTV =
  Platform.isTV ||
  (Platform.OS === "android" &&
    !!Platform.constants.uiMode &&
    (Platform.constants.uiMode & 15) === 4);

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
  itemWidth?: number; // Added to help with TV navigation
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
  itemWidth = 200, // Default item width estimate
  ...props
}: HorizontalScrollProps): React.ReactElement {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const flashListRef = useRef<FlashList<BaseItemDto>>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const itemRefs = useRef<Array<any>>([]);

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
      } else {
        return undefined;
      }
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

  // Initialize refs array when data changes
  useEffect(() => {
    if (flatData) {
      itemRefs.current = Array(flatData.length).fill(null);
    }
  }, [flatData]);

  useEffect(() => {
    if (data) {
      animatedOpacity.value = 1;
    }
  }, [data]);

  // Handle focus change for TV navigation
  const handleItemFocus = (index: number) => {
    setFocusedIndex(index);

    // Ensure the focused item is visible by scrolling if needed
    if (isTV && flashListRef.current) {
      flashListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5, // Center the item in the view
      });
    }
  };

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
        ref={flashListRef}
        data={flatData}
        renderItem={({ item, index }) => (
          <View
            className="mr-2"
            ref={(ref) => {
              itemRefs.current[index] = ref;
            }}
            onFocus={() => handleItemFocus(index)}
            // Add TV-specific props for better focus handling
            {...(isTV && {
              hasTVPreferredFocus: index === 0,
              tvParallaxProperties: { enabled: false }, // Disable parallax effect for smoother navigation
            })}
          >
            <React.Fragment>{renderItem(item, index)}</React.Fragment>
          </View>
        )}
        estimatedItemSize={itemWidth}
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
        // Add TV-specific props for better focus management
        maintainVisibleContentPosition={
          isTV
            ? {
                minIndexForVisible: 0,
                autoscrollToTopThreshold: 10,
              }
            : undefined
        }
        // Ensure we have enough items visible for TV navigation
        initialScrollIndex={0}
        extraData={focusedIndex} // Include focusedIndex in extraData to trigger re-renders
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center">
            <Text className="text-center text-gray-500">
              {t("item_card.no_data_available")}
            </Text>
          </View>
        }
        {...props}
      />
    </Animated.View>
  );
}
