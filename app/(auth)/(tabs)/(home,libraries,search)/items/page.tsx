import { Text } from "@/components/common/Text";
import { ItemContent } from "@/components/ItemContent";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import {
  getMediaInfoApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
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

const Page: React.FC = () => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { id } = useLocalSearchParams() as { id: string };

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
    opacity.value = withTiming(0, { duration: 300 }, (finished) => {
      if (finished) {
        runOnJS(callback)();
      }
    });
  };

  const fadeIn = (callback: any) => {
    opacity.value = withTiming(1, { duration: 300 }, (finished) => {
      if (finished) {
        runOnJS(callback)();
      }
    });
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
        <Text>Could not load item</Text>
      </View>
    );

  return (
    <View className="flex flex-1 relative">
      <Animated.View
        pointerEvents={"none"}
        style={[animatedStyle]}
        className="absolute top-0 left-0 flex flex-col items-start h-screen w-screen px-4 z-50 bg-black"
      >
        <View className="h-[350px] bg-transparent rounded-lg mb-4 w-full"></View>
        <View className="h-6 bg-neutral-900 rounded mb-1 w-12"></View>
        <View className="h-12 bg-neutral-900 rounded-lg mb-1 w-1/2"></View>
        <View className="h-12 bg-neutral-900 rounded-lg w-2/3 mb-10"></View>
        <View className="h-4 bg-neutral-900 rounded-lg mb-1 w-full"></View>
        <View className="h-12 bg-neutral-900 rounded-lg mb-1 w-full"></View>
        <View className="h-12 bg-neutral-900 rounded-lg mb-1 w-full"></View>
        <View className="h-4 bg-neutral-900 rounded-lg mb-1 w-1/4"></View>
      </Animated.View>
      {item && <ItemContent item={item} />}
    </View>
  );
};

export default Page;
