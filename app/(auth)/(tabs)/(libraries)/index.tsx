import { Loader } from "@/components/Loader";
import { Text } from "@/components/common/Text";
import { LibraryItemCard } from "@/components/library/LibraryItemCard";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import {
  getUserLibraryApi,
  getUserViewsApi,
} from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function index() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const queryClient = useQueryClient();
  const [settings] = useSettings();

  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["user-views", user?.Id],
    queryFn: async () => {
      const response = await getUserViewsApi(api!).getUserViews({
        userId: user?.Id,
      });

      return response.data.Items || null;
    },
    staleTime: 60,
  });

  const libraries = useMemo(
    () =>
      data
        ?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!))
        .filter((l) => l.CollectionType !== "music")
        .filter((l) => l.CollectionType !== "books") || [],
    [data, settings?.hiddenLibraries],
  );

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

  if (isLoading)
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
    <FlashList
      extraData={settings}
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingTop: 17,
        paddingHorizontal: settings?.libraryOptions?.display === "row" ? 0 : 17,
        paddingBottom: 150,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
      data={libraries}
      renderItem={({ item }) => <LibraryItemCard library={item} />}
      keyExtractor={(item) => item.Id || ""}
      ItemSeparatorComponent={() =>
        settings?.libraryOptions?.display === "row" ? (
          <View
            style={{
              height: StyleSheet.hairlineWidth,
            }}
            className='bg-neutral-800 mx-2 my-4'
          />
        ) : (
          <View className='h-4' />
        )
      }
      estimatedItemSize={200}
    />
  );
}
