import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FavoritesTabButtons } from "@/components/favorites/FavoritesTabButtons";
import { Favorites } from "@/components/home/Favorites";
import { Favorites as TVFavorites } from "@/components/home/Favorites.tv";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useSettings } from "@/utils/atoms/settings";

export default function FavoritesPage() {
  const invalidateCache = useInvalidatePlaybackProgressCache();
  const { t } = useTranslation();
  const { settings } = useSettings();

  const [loading, setLoading] = useState(false);
  // KefinTweaks watchlist (Likes-backed) view, toggled in-place like Discover.
  const watchlistEnabled = settings?.useKefinTweaks ?? false;
  const [viewType, setViewType] = useState<"Favorites" | "Watchlist">(
    "Favorites",
  );
  const refetch = useCallback(async () => {
    setLoading(true);
    await invalidateCache();
    setLoading(false);
  }, []);
  const insets = useSafeAreaInsets();

  if (Platform.isTV) {
    return <TVFavorites />;
  }

  const isWatchlist = watchlistEnabled && viewType === "Watchlist";

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
        {watchlistEnabled && (
          <View className='pl-4 pr-4 flex flex-row mb-2'>
            <FavoritesTabButtons
              viewType={viewType}
              setViewType={setViewType}
              t={t}
            />
          </View>
        )}
        {isWatchlist ? (
          <Favorites
            filter='Likes'
            queryKeyBase='watchlist'
            emptyTitleKey='favorites.noWatchlistTitle'
            emptyTextKey='favorites.noWatchlistData'
          />
        ) : (
          <Favorites />
        )}
      </View>
    </ScrollView>
  );
}
