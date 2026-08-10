import { useLocalSearchParams, useRootNavigationState } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { usePlayMedia } from "@/hooks/usePlayMedia";

export default function TopShelfPlayRedirect() {
  const router = useRouter();
  const playMedia = usePlayMedia();
  const rootNavigationState = useRootNavigationState();
  const { id } = useLocalSearchParams<{
    id?: string;
  }>();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!rootNavigationState?.key || startedRef.current) {
      return;
    }
    startedRef.current = true;

    if (!id) {
      router.replace("/(auth)/(tabs)/(home)");
      return;
    }

    // Land on Home first so the player (native present or JS route push)
    // has a sane screen underneath, then run the play chooser: native
    // player when the TV toggle is on, JS route otherwise.
    router.replace("/(auth)/(tabs)/(home)");
    void playMedia({ itemId: id, offline: false });
  }, [id, rootNavigationState?.key, router, playMedia]);

  return <View style={{ flex: 1, backgroundColor: "#000" }} />;
}
