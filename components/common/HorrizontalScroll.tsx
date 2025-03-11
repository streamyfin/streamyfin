import { FlashList, FlashListProps } from "@shopify/flash-list";
import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import { View, ViewStyle, Platform, findNodeHandle } from "react-native";
import { Text } from "./Text";

type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export interface HorizontalScrollRef {
  scrollToIndex: (index: number, viewOffset: number) => void;
}

interface HorizontalScrollProps<T>
  extends PartialExcept<
    Omit<FlashListProps<T>, "renderItem">,
    "estimatedItemSize"
  > {
  data?: T[] | null;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  containerStyle?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  loadingContainerStyle?: ViewStyle;
  height?: number;
  loading?: boolean;
  extraData?: any;
  noItemsText?: string;
  itemWidth?: number; // Added to help with TV navigation
}

// Check if we're running on a TV platform
const isTV = Platform.isTV || Platform.OS === 'android' && !!Platform.constants.uiMode && 
  (Platform.constants.uiMode & 15) === 4;

export const HorizontalScroll = forwardRef<
  HorizontalScrollRef,
  HorizontalScrollProps<any>
>(
  <T,>(
    {
      data = [],
      keyExtractor,
      renderItem,
      containerStyle,
      contentContainerStyle,
      loadingContainerStyle,
      loading = false,
      height = 164,
      extraData,
      noItemsText,
      itemWidth = 200, // Default item width estimate
      ...props
    }: HorizontalScrollProps<T>,
    ref: React.ForwardedRef<HorizontalScrollRef>
  ) => {
    const flashListRef = useRef<FlashList<T>>(null);
    const [focusedIndex, setFocusedIndex] = useState<number>(0);
    const itemRefs = useRef<Array<any>>([]);

    // Initialize refs array when data changes
    useEffect(() => {
      if (data) {
        itemRefs.current = Array(data.length).fill(null);
      }
    }, [data]);

    useImperativeHandle(ref!, () => ({
      scrollToIndex: (index: number, viewOffset: number) => {
        flashListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0,
          viewOffset,
        });
      },
    }));

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

    const renderFlashListItem = ({
      item,
      index,
    }: {
      item: T;
      index: number;
    }) => (
      <View 
        className="mr-2"
        ref={ref => { itemRefs.current[index] = ref; }}
        onFocus={() => handleItemFocus(index)}
        // Add TV-specific props for better focus handling
        {...(isTV && {
          hasTVPreferredFocus: index === 0,
          tvParallaxProperties: { enabled: false }, // Disable parallax effect for smoother navigation
        })}
      >
        <React.Fragment>{renderItem(item, index)}</React.Fragment>
      </View>
    );

    if (!data || loading) {
      return (
        <View className="px-4 mb-2">
          <View className="bg-neutral-950 h-24 w-full rounded-md mb-2"></View>
          <View className="bg-neutral-950 h-10 w-full rounded-md mb-1"></View>
        </View>
      );
    }

    return (
      <FlashList<T>
        ref={flashListRef}
        data={data}
        extraData={[extraData, focusedIndex]} // Include focusedIndex in extraData
        renderItem={renderFlashListItem}
        horizontal
        estimatedItemSize={itemWidth}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          ...contentContainerStyle,
        }}
        keyExtractor={keyExtractor}
        // Add TV-specific props for better focus management
        maintainVisibleContentPosition={isTV ? {
          minIndexForVisible: 0,
          autoscrollToTopThreshold: 10
        } : undefined}
        // Ensure we have enough items visible for TV navigation
        initialScrollIndex={0}
        ListEmptyComponent={() => (
          <View className="flex-1 justify-center items-center">
            <Text className="text-center text-gray-500">
              {noItemsText || "No data available"}
            </Text>
          </View>
        )}
        {...props}
      />
    );
  }
);
