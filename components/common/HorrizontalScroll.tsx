import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Platform, ScrollView, View } from "react-native";
import { Loader } from "../Loader";
import { Text } from "./Text";
import { TVFocusable } from "./TVFocusable";

export interface HorizontalScrollRef {
  scrollToIndex: (index: number, offset?: number) => void;
}

interface Props<T> {
  data?: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  loading?: boolean;
  noItemsText?: string;
  height?: number;
  extraData?: any;
}

export const HorizontalScroll = forwardRef<HorizontalScrollRef, Props<any>>(
  (
    { data, renderItem, keyExtractor, loading, noItemsText, height, extraData },
    ref,
  ) => {
    const scrollRef = useRef<ScrollView>(null);
    const itemRefs = useRef<View[]>([]);

    useImperativeHandle(ref, () => ({
      scrollToIndex: (index: number, offset = 0) => {
        if (itemRefs.current[index]) {
          itemRefs.current[index].measureLayout(
            // @ts-ignore
            scrollRef.current,
            (x: number) => {
              scrollRef.current?.scrollTo({
                x: x - offset,
                animated: true,
              });
            },
            () => {},
          );
        }
      },
    }));

    if (loading) {
      return (
        <View
          style={{
            height: height || 200,
          }}
          className="flex flex-col items-center justify-center"
        >
          <Loader />
        </View>
      );
    }

    if (!data || data.length === 0) {
      return (
        <View
          style={{
            height: height || 200,
          }}
          className="flex flex-col items-center justify-center"
        >
          <Text className="text-neutral-500">{noItemsText || "No items"}</Text>
        </View>
      );
    }

    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4"
        extraData={extraData}
      >
        <View className="flex flex-row space-x-4">
          {data.map((item, index) => {
            // Extract the rendered item
            const renderedItem = renderItem(item, index);

            // If the rendered item is already a TVFocusable, return it as is
            if (
              Platform.isTV &&
              React.isValidElement(renderedItem) &&
              renderedItem.type === TVFocusable
            ) {
              return (
                <View
                  key={keyExtractor?.(item, index) || index}
                  ref={(el) => (itemRefs.current[index] = el!)}
                  collapsable={false}
                >
                  {renderedItem}
                </View>
              );
            }

            // Otherwise wrap it in a TVFocusable if on TV platform
            return (
              <View
                key={keyExtractor?.(item, index) || index}
                ref={(el) => (itemRefs.current[index] = el!)}
                collapsable={false}
              >
                {Platform.isTV ? (
                  <TVFocusable
                    hasTVPreferredFocus={index === 0}
                    forceFocus={index === 0}
                  >
                    {renderedItem}
                  </TVFocusable>
                ) : (
                  renderedItem
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  },
);
