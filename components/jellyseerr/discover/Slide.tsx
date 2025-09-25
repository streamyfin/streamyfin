import { FlashList } from "@shopify/flash-list";
import type { ContentStyle } from "@shopify/flash-list/src/FlashListProps";
import { t } from "i18next";
import type React from "react";
import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import type DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";

export interface SlideProps {
  slide: DiscoverSlider;
  contentContainerStyle?: ContentStyle;
}

interface Props<T> extends SlideProps {
  data: T[];
  renderItem: (
    item: T,
    index: number,
  ) => React.ComponentType<any> | React.ReactElement | null | undefined;
  keyExtractor: (item: T) => string;
  onEndReached?: (() => void) | null;
}

const Slide = <T,>({
  data,
  slide,
  renderItem,
  keyExtractor,
  onEndReached,
  contentContainerStyle,
  ...props
}: PropsWithChildren<Props<T> & ViewProps>) => {
  return (
    <View {...props}>
      <Text className='font-bold text-lg mb-2 px-4'>
        {t(`search.${DiscoverSliderType[slide.type].toString().toLowerCase()}`)}
      </Text>
      <FlashList
        horizontal
        contentContainerStyle={{
          paddingHorizontal: 16,
          ...(contentContainerStyle ?? {}),
        }}
        showsHorizontalScrollIndicator={false}
        keyExtractor={keyExtractor}
        estimatedItemSize={250}
        data={data}
        onEndReachedThreshold={1}
        onEndReached={onEndReached}
        renderItem={({ item, index }) => {
          if (!item) return null;
          const rendered = renderItem(item, index);
          if (!rendered) return null;
          if (typeof rendered === "function") {
            const Comp: any = rendered;
            return <Comp />;
          }
          return rendered;
        }}
      />
    </View>
  );
};

export default Slide;
