import {
  type Href,
  useLocalSearchParams,
  useRootNavigationState,
} from "expo-router";
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

    // The path is built from the link at run time, so the typed routes cannot
    // check it. `withAnchor` puts Home under the page: without it the page is
    // the only screen in the stack, and Back has nowhere to go but out of the
    // app.
    router.replace(
      getTopShelfItemPath({ id, type, seriesId, seasonIndex }) as Href,
      { withAnchor: true },
    );
  }, [id, rootNavigationState?.key, router, seasonIndex, seriesId, type]);

  return <View style={{ flex: 1, backgroundColor: "#000" }} />;
}
