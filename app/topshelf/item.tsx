import { useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import useRouter from "@/hooks/useAppRouter";

export default function TopShelfItemRedirect() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { id, type } = useLocalSearchParams<{
    id?: string;
    type?: string;
  }>();

  useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }

    if (!id) {
      router.replace("/(auth)/(tabs)/(home)");
      return;
    }

    if (type === "Series") {
      router.replace(`/(auth)/(tabs)/(home)/series/${id}`);
      return;
    }

    router.replace(`/(auth)/(tabs)/(home)/items/page?id=${id}`);
  }, [id, rootNavigationState?.key, router, type]);

  return <View style={{ flex: 1, backgroundColor: "#000" }} />;
}
