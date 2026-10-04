import { useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { getTopShelfItemPath } from "@/utils/tvDiscovery/itemPath";

export default function TopShelfItemRedirect() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { id, type, seriesId, seasonIndex } = useLocalSearchParams<{
    id?: string;
    type?: string;
    seriesId?: string;
    seasonIndex?: string;
  }>();

  useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }

    if (!id) {
      router.replace("/(auth)/(tabs)/(home)");
      return;
    }

    router.replace(getTopShelfItemPath({ id, type, seriesId, seasonIndex }));
  }, [id, rootNavigationState?.key, router, seasonIndex, seriesId, type]);

  return <View style={{ flex: 1, backgroundColor: "#000" }} />;
}
