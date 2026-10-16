import { useCallback, useState } from "react";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Favorites } from "@/components/home/Favorites";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";

// Required, not imported: an import would put the TV favorites, and every TV
// component they use, in the phone bundle too.
const TVFavorites: typeof import("@/components/home/Favorites.tv").Favorites =
  Platform.isTV ? require("@/components/home/Favorites.tv").Favorites : null;

export default function FavoritesPage() {
  const invalidateCache = useInvalidatePlaybackProgressCache();

  const [loading, setLoading] = useState(false);
  const refetch = useCallback(async () => {
    setLoading(true);
    await invalidateCache();
    setLoading(false);
  }, [invalidateCache]);
  const insets = useSafeAreaInsets();

  if (Platform.isTV) {
    return <TVFavorites />;
  }

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
      <View style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}>
        <Favorites />
      </View>
    </ScrollView>
  );
}
