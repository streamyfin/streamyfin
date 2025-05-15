import { Favorites } from "@/components/home/Favorites";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function favorites() {
  const invalidateCache = useInvalidatePlaybackProgressCache();

  const [loading, setLoading] = useState(false);
  const refetch = useCallback(async () => {
    setLoading(true);
    await invalidateCache();
    setLoading(false);
  }, []);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      nestedScrollEnabled
      contentInsetAdjustmentBehavior='automatic'
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refetch} />
      }
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 16,
      }}
    >
      <View className='my-4'>
        <Favorites />
      </View>
    </ScrollView>
  );
}
