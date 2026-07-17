import { useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import useRouter from "@/hooks/useAppRouter";

export default function TopShelfPlayRedirect() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { id } = useLocalSearchParams<{
    id?: string;
  }>();

  useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }

    if (!id) {
      router.replace("/(auth)/(tabs)/(home)");
      return;
    }

    const queryParams = new URLSearchParams({
      itemId: id,
      offline: "false",
    });

    router.replace(`/player/direct-player?${queryParams.toString()}`);
  }, [id, rootNavigationState?.key, router]);

  return <View style={{ flex: 1, backgroundColor: "#000" }} />;
}
