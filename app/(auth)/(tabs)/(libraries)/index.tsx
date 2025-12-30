import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  getUserLibraryApi,
  getUserViewsApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { LibraryItemCard } from "@/components/library/LibraryItemCard";
import { useChannels } from "@/hooks/useChannels";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getOfflineLibraryViews } from "@/providers/OfflineLibrary/database";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import { useSettings } from "@/utils/atoms/settings";

export default function index() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { offlineMode } = useOfflineLibrary();

  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["user-views", user?.Id, offlineMode ? "offline" : "online"],
    queryFn: async () => {
      const response = await getUserViewsApi(api!).getUserViews({
        userId: user?.Id,
      });

      return response.data.Items || null;
    },
    enabled: !offlineMode && !!api && !!user?.Id,
    networkMode: offlineMode ? "offlineFirst" : "online",
    staleTime: 60,
  });

  // Fetch channels
  const { data: channels, isLoading: isChannelsLoading } = useChannels();

  const libraries = useMemo(() => {
    // When offline, show available offline library views
    if (offlineMode) {
      return getOfflineLibraryViews();
    }

    const filteredLibraries =
      data
        ?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!))
        // Music libraries are now supported
        .filter((l) => l.CollectionType !== "books") || [];

    // Merge libraries with channels
    const allItems: BaseItemDto[] = [...filteredLibraries];
    if (channels && channels.length > 0) {
      allItems.push(...channels);
    }

    // Deduplicate by ID (channels might already be in user views from server-side plugins)
    const uniqueItems = allItems.filter(
      (item, index, self) => index === self.findIndex((t) => t.Id === item.Id),
    );

    return uniqueItems;
  }, [data, settings?.hiddenLibraries, channels, offlineMode]);

  useEffect(() => {
    for (const item of data || []) {
      queryClient.prefetchQuery({
        queryKey: ["library", item.Id],
        queryFn: async () => {
          if (!item.Id || !user?.Id || !api) return null;
          const response = await getUserLibraryApi(api).getItem({
            itemId: item.Id,
            userId: user?.Id,
          });
          return response.data;
        },
        staleTime: 60 * 1000,
      });
    }
  }, [data]);

  const insets = useSafeAreaInsets();

  // Don't show loading when offline (data comes from local DB synchronously)
  if (!offlineMode && (isLoading || isChannelsLoading))
    return (
      <View className='justify-center items-center h-full'>
        <Loader />
      </View>
    );

  if (!libraries)
    return (
      <View className='h-full w-full flex justify-center items-center'>
        <Text className='text-lg text-neutral-500'>
          {t("library.no_libraries_found")}
        </Text>
      </View>
    );

  return (
    <FlatList
      extraData={settings}
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingTop: Platform.OS === "android" ? 17 : 0,
        paddingHorizontal: settings?.libraryOptions?.display === "row" ? 0 : 17,
        paddingBottom: 150,
        paddingLeft: insets.left + 17,
        paddingRight: insets.right + 17,
      }}
      data={libraries}
      renderItem={({ item }) => <LibraryItemCard library={item} />}
      keyExtractor={(item) => item.Id || ""}
      ItemSeparatorComponent={() => (
        <View
          style={{
            height: settings?.libraryOptions?.display === "row" ? 24 : 16,
            width: "100%",
          }}
        />
      )}
    />
  );
}
