import { FlashList, type FlashListProps } from "@shopify/flash-list";
import React, { useImperativeHandle, useRef } from "react";
import { View, type ViewStyle } from "react-native";
import { Text } from "./Text";

export interface HorizontalScrollRef {
  scrollToIndex: (index: number, viewOffset: number) => void;
}

interface HorizontalScrollProps<T>
  extends Omit<FlashListProps<T>, "renderItem" | "estimatedItemSize" | "data"> {
  data?: T[] | null;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  containerStyle?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  height?: number;
  loading?: boolean;
  extraData?: any;
  noItemsText?: string;
}

export const HorizontalScroll = <T,>(
  props: HorizontalScrollProps<T> & {
    ref?: React.ForwardedRef<HorizontalScrollRef>;
  },
) => {
  const {
    data = [],
    keyExtractor,
    renderItem,
    containerStyle,
    contentContainerStyle,
    loading = false,
    height = 164,
    extraData,
    noItemsText,
    ref,
    ...restProps
  } = props;

  const flashListRef = useRef<React.ComponentRef<typeof FlashList<T>>>(null);

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

  const renderFlashListItem = ({ item, index }: { item: T; index: number }) => (
    <View className='mr-2'>{renderItem(item, index)}</View>
  );

  if (!data || loading) {
    return (
      <View className='px-4'>
        <View className='bg-neutral-950 h-24 w-full rounded-md mb-2' />
        <View className='bg-neutral-950 h-10 w-full rounded-md mb-1' />
      </View>
    );
  }

  return (
    <View style={[{ height }, containerStyle]}>
      <FlashList<T>
        ref={flashListRef}
        data={data}
        extraData={extraData}
        renderItem={renderFlashListItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 16,
          ...contentContainerStyle,
        }}
        keyExtractor={keyExtractor}
        ListEmptyComponent={() => (
          <View className='flex-1 justify-center items-center'>
            <Text className='text-center text-gray-500'>
              {noItemsText || "No data available"}
            </Text>
          </View>
        )}
        {...restProps}
      />
    </View>
  );
};
