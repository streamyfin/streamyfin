import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, RefreshControl, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import {
  useStreamystatsEnabled,
  useWatchlistsQuery,
} from "@/hooks/useWatchlists";
import { userAtom } from "@/providers/JellyfinProvider";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

interface WatchlistCardProps {
  watchlist: StreamystatsWatchlist;
  isOwner: boolean;
  onPress: () => void;
}

const WatchlistCard: React.FC<WatchlistCardProps> = ({
  watchlist,
  isOwner,
  onPress,
}) => {
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      onPress={onPress}
      className='bg-neutral-900 rounded-xl p-4 mx-4 mb-3'
      activeOpacity={0.7}
    >
      <View className='flex-row items-center justify-between mb-2'>
        <Text className='text-lg font-semibold flex-1' numberOfLines={1}>
          {watchlist.name}
        </Text>
        <View className='flex-row items-center gap-2'>
          {isOwner && (
            <View className='bg-purple-600/20 px-2 py-1 rounded'>
              <Text className='text-purple-400 text-xs'>
                {t("watchlists.you")}
              </Text>
            </View>
          )}
          <Ionicons
            name={watchlist.isPublic ? "globe-outline" : "lock-closed-outline"}
            size={16}
            color='#9ca3af'
          />
        </View>
      </View>

      {watchlist.description && (
        <Text className='text-neutral-400 text-sm mb-2' numberOfLines={2}>
          {watchlist.description}
        </Text>
      )}

      <View className='flex-row items-center gap-4'>
        <View className='flex-row items-center gap-1'>
          <Ionicons name='film-outline' size={14} color='#9ca3af' />
          <Text className='text-neutral-400 text-sm'>
            {watchlist.itemCount ?? 0}{" "}
            {(watchlist.itemCount ?? 0) === 1
              ? t("watchlists.item")
              : t("watchlists.items")}
          </Text>
        </View>
        {watchlist.allowedItemType && (
          <View className='bg-neutral-800 px-2 py-0.5 rounded'>
            <Text className='text-neutral-400 text-xs'>
              {watchlist.allowedItemType}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const EmptyState: React.FC<{ onCreatePress: () => void }> = ({
  onCreatePress: _onCreatePress,
}) => {
  const { t } = useTranslation();

  return (
    <View className='flex-1 items-center justify-center px-8'>
      <Ionicons name='list-outline' size={64} color='#4b5563' />
      <Text className='text-xl font-semibold mt-4 text-center'>
        {t("watchlists.empty_title")}
      </Text>
      <Text className='text-neutral-400 text-center mt-2 mb-6'>
        {t("watchlists.empty_description")}
      </Text>
    </View>
  );
};

const NotConfiguredState: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className='flex-1 items-center justify-center px-8'>
      <Ionicons name='settings-outline' size={64} color='#4b5563' />
      <Text className='text-xl font-semibold mt-4 text-center'>
        {t("watchlists.not_configured_title")}
      </Text>
      <Text className='text-neutral-400 text-center mt-2 mb-6'>
        {t("watchlists.not_configured_description")}
      </Text>
      <Button
        onPress={() =>
          router.push(
            "/(auth)/(tabs)/(home)/settings/plugins/streamystats/page",
          )
        }
        className='px-6'
      >
        <Text className='font-semibold'>{t("watchlists.go_to_settings")}</Text>
      </Button>
    </View>
  );
};

export default function WatchlistsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAtomValue(userAtom);
  const streamystatsEnabled = useStreamystatsEnabled();
  const { data: watchlists, isLoading, refetch } = useWatchlistsQuery();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleCreatePress = useCallback(() => {
    router.push("/(auth)/(tabs)/(watchlists)/create");
  }, [router]);

  const handleWatchlistPress = useCallback(
    (watchlistId: number) => {
      router.push(`/(auth)/(tabs)/(watchlists)/${watchlistId}`);
    },
    [router],
  );

  // Separate watchlists into "mine" and "public"
  const { myWatchlists, publicWatchlists } = useMemo(() => {
    if (!watchlists) return { myWatchlists: [], publicWatchlists: [] };

    const mine: StreamystatsWatchlist[] = [];
    const pub: StreamystatsWatchlist[] = [];

    for (const w of watchlists) {
      if (w.userId === user?.Id) {
        mine.push(w);
      } else {
        pub.push(w);
      }
    }

    return { myWatchlists: mine, publicWatchlists: pub };
  }, [watchlists, user?.Id]);

  // Combine into sections for FlashList
  const sections = useMemo(() => {
    const result: Array<
      | { type: "header"; title: string }
      | { type: "watchlist"; data: StreamystatsWatchlist; isOwner: boolean }
    > = [];

    if (myWatchlists.length > 0) {
      result.push({ type: "header", title: t("watchlists.my_watchlists") });
      for (const w of myWatchlists) {
        result.push({ type: "watchlist", data: w, isOwner: true });
      }
    }

    if (publicWatchlists.length > 0) {
      result.push({ type: "header", title: t("watchlists.public_watchlists") });
      for (const w of publicWatchlists) {
        result.push({ type: "watchlist", data: w, isOwner: false });
      }
    }

    return result;
  }, [myWatchlists, publicWatchlists, t]);

  if (!streamystatsEnabled) {
    return <NotConfiguredState />;
  }

  if (!isLoading && (!watchlists || watchlists.length === 0)) {
    return <EmptyState onCreatePress={handleCreatePress} />;
  }

  return (
    <FlashList
      data={sections}
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingTop: Platform.OS === "android" ? 10 : 0,
        paddingBottom: 100,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      renderItem={({ item }) => {
        if (item.type === "header") {
          return (
            <Text className='text-lg font-bold px-4 pt-4 pb-2'>
              {item.title}
            </Text>
          );
        }

        return (
          <WatchlistCard
            watchlist={item.data}
            isOwner={item.isOwner}
            onPress={() => handleWatchlistPress(item.data.id)}
          />
        );
      }}
      getItemType={(item) => item.type}
    />
  );
}
