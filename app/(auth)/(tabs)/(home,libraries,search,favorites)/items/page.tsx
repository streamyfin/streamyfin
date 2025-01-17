import { Text } from "@/components/common/Text";
import { ItemContent } from "@/components/ItemContent";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useAtom } from "jotai";
import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";

const Page: React.FC = () => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { id } = useLocalSearchParams() as { id: string };
  const { t } = useTranslation();

  const { data: item, isError } = useQuery({
    queryKey: ["item", id],
    queryFn: async () => {
      if (!api || !user || !id) return;
      const res = await getUserLibraryApi(api).getItem({
        itemId: id,
        userId: user?.Id,
      });

      return res.data;
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const fadeOut = (callback: any) => {
    setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 }, (finished) => {
        if (finished) {
          runOnJS(callback)();
        }
      });
    }, 100);
  };

  const fadeIn = (callback: any) => {
    setTimeout(() => {
      opacity.value = withTiming(1, { duration: 500 }, (finished) => {
        if (finished) {
          runOnJS(callback)();
        }
      });
    }, 100);
  };

  useEffect(() => {
    if (item) {
      fadeOut(() => {});
    } else {
      fadeIn(() => {});
    }
  }, [item]);

  if (isError)
    return (
      <View className="flex flex-col items-center justify-center h-screen w-screen">
        <Text>{t("item_card.could_not_load_item")}</Text>
      </View>
    );

  return (
    <View className="flex flex-1 relative">
      <Animated.View
        pointerEvents={"none"}
        style={[animatedStyle]}
        className="absolute top-0 left-0 flex flex-col items-start h-screen w-screen px-4 z-50 bg-black"
      >
        <View
          style={{
            height: item?.Type === "Episode" ? 300 : 450,
          }}
          className="bg-transparent rounded-lg mb-4 w-full"
        ></View>
        <View className="h-6 bg-neutral-900 rounded mb-4 w-14"></View>
        <View className="h-10 bg-neutral-900 rounded-lg mb-2 w-1/2"></View>
        <View className="h-3 bg-neutral-900 rounded mb-3 w-8"></View>
        <View className="flex flex-row space-x-1 mb-8">
          <View className="h-6 bg-neutral-900 rounded mb-3 w-14"></View>
          <View className="h-6 bg-neutral-900 rounded mb-3 w-14"></View>
          <View className="h-6 bg-neutral-900 rounded mb-3 w-14"></View>
        </View>
        <View className="h-3 bg-neutral-900 rounded w-2/3 mb-1"></View>
        <View className="h-10 bg-neutral-900 rounded-lg w-full mb-2"></View>
        <View className="h-12 bg-neutral-900 rounded-lg w-full mb-2"></View>
        <View className="h-24 bg-neutral-900 rounded-lg mb-1 w-full"></View>
      </Animated.View>
      {item && <ItemContent item={item} />}
    </View>
  );
};

export default Page;
