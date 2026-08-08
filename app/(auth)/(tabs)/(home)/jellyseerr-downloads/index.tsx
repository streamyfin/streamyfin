import { FlashList } from "@shopify/flash-list";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, RefreshControl, View } from "react-native";
import { Text } from "@/components/common/Text";
import { JellyseerrDownloadCard } from "@/components/jellyseerr/JellyseerrDownloadCard";
import { Loader } from "@/components/Loader";
import { useJellyseerrDownloads } from "@/hooks/useJellyseerrDownloads";

export default function JellyseerrDownloadsPage() {
  const { t } = useTranslation();
  const { downloads, isLoading, refetch } = useJellyseerrDownloads();

  // Local flag rather than React Query's isRefetching: that one is also true
  // for the background poll, which would spin the control every 15s unprompted.
  const [pulling, setPulling] = useState(false);
  const onRefresh = useCallback(async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  }, [refetch]);

  const refreshControl = (
    <RefreshControl refreshing={pulling} onRefresh={onRefresh} />
  );

  if (isLoading)
    return (
      <View className='justify-center items-center h-full'>
        <Loader />
      </View>
    );

  if (downloads.length === 0)
    return (
      <FlashList
        contentInsetAdjustmentBehavior='automatic'
        contentContainerStyle={{ paddingHorizontal: 17 }}
        data={[]}
        renderItem={null}
        refreshControl={refreshControl}
        ListEmptyComponent={
          <View className='h-full w-full flex justify-center items-center py-32'>
            <Text className='text-lg text-neutral-500'>
              {t("jellyseerr.downloads.empty")}
            </Text>
          </View>
        }
      />
    );

  return (
    <FlashList
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingTop: Platform.OS === "android" ? 17 : 0,
        paddingHorizontal: 17,
        paddingBottom: 150,
      }}
      data={downloads}
      renderItem={({ item }) => <JellyseerrDownloadCard download={item} />}
      keyExtractor={(item) => item.key}
      refreshControl={refreshControl}
    />
  );
}
