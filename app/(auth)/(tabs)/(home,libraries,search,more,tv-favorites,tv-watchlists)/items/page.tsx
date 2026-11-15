import { ItemFields } from "@jellyfin/sdk/lib/generated-client/models";
import { useLocalSearchParams } from "expo-router";
import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { ItemContent } from "@/components/ItemContent";
import { useItemQuery } from "@/hooks/useItemQuery";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";

const ItemContentSkeletonTV = Platform.isTV
  ? require("@/components/ItemContentSkeleton.tv").ItemContentSkeletonTV
  : null;

const Page: React.FC = () => {
  const { id } = useLocalSearchParams() as { id: string };
  const { t } = useTranslation();

  const { offline } = useLocalSearchParams() as { offline?: string };
  const isOffline = offline === "true";

  // Exclude MediaSources/MediaStreams from initial fetch for faster loading
  // (especially important for plugins like Gelato)
  const {
    data: item,
    isError,
    isLoading,
  } = useItemQuery(id, isOffline, undefined, [
    ItemFields.MediaSources,
    ItemFields.MediaSourceCount,
    ItemFields.MediaStreams,
  ]);

  // Lazily preload item with full media sources in background — never cache
  const { data: itemWithSources } = useItemQuery(id, isOffline, undefined, [], {
    gcTime: 0,
  });

  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  // Fast fade out when item loads (no setTimeout delay)
  useEffect(() => {
    if (item) {
      opacity.value = withTiming(0, { duration: 150 });
    } else {
      opacity.value = withTiming(1, { duration: 150 });
    }
  }, [item, opacity]);

  if (isError)
    return (
      <View className='flex flex-col items-center justify-center h-screen w-screen'>
        <Text>{t("item_card.could_not_load_item")}</Text>
      </View>
    );

  return (
    <OfflineModeProvider isOffline={isOffline}>
      <View className='flex flex-1 relative'>
        {/* Always render ItemContent - it handles loading state internally on TV */}
        <ItemContent
          item={item}
          itemWithSources={itemWithSources}
          isLoading={isLoading}
        />

        {/* Skeleton overlay - fades out when content loads */}
        {!item && (
          <Animated.View
            pointerEvents={"none"}
            style={[animatedStyle]}
            className='absolute top-0 left-0 flex flex-col items-start h-screen w-screen z-50 bg-black'
          >
            {Platform.isTV && ItemContentSkeletonTV ? (
              <ItemContentSkeletonTV />
            ) : (
              <View style={{ paddingHorizontal: 16, width: "100%" }}>
                <View
                  style={{
                    height: 450,
                  }}
                  className='bg-transparent rounded-lg mb-4 w-full'
                />
                <View className='h-6 bg-neutral-900 rounded mb-4 w-14' />
                <View className='h-10 bg-neutral-900 rounded-lg mb-2 w-1/2' />
                <View className='h-3 bg-neutral-900 rounded mb-3 w-8' />
                <View className='flex flex-row space-x-1 mb-8'>
                  <View className='h-6 bg-neutral-900 rounded mb-3 w-14' />
                  <View className='h-6 bg-neutral-900 rounded mb-3 w-14' />
                  <View className='h-6 bg-neutral-900 rounded mb-3 w-14' />
                </View>
                <View className='h-3 bg-neutral-900 rounded w-2/3 mb-1' />
                <View className='h-10 bg-neutral-900 rounded-lg w-full mb-2' />
                <View className='h-12 bg-neutral-900 rounded-lg w-full mb-2' />
                <View className='h-24 bg-neutral-900 rounded-lg mb-1 w-full' />
              </View>
            )}
          </Animated.View>
        )}
      </View>
    </OfflineModeProvider>
  );
};

export default Page;
