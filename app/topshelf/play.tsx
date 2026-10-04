import {
  type Href,
  useLocalSearchParams,
  useRootNavigationState,
} from "expo-router";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  getTopShelfPlayLanding,
  lookUpTopShelfPlayItem,
} from "@/utils/tvDiscovery/playLanding";

export default function TopShelfPlayRedirect() {
  const router = useRouter();
  const playMedia = usePlayMedia();
  const rootNavigationState = useRootNavigationState();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
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

    void (async () => {
      // The link carries nothing but an id, so ask what it is before a player
      // opens. A tile published by an older build can still point a series or
      // a season here, and the player has nothing to show for one but an
      // error: open the page the tile's own route leads to instead.
      const item = await lookUpTopShelfPlayItem({
        api,
        userId: user?.Id,
        itemId: id,
      });
      const landing = getTopShelfPlayLanding(item);
      if (landing) {
        // The path is built from the item at run time, so the typed routes
        // cannot check it. `withAnchor` puts Home under the page, the same
        // as a tile's own link does in item.tsx.
        router.replace(landing as Href, { withAnchor: true });
        return;
      }

      // Land on Home first so the player (native present or JS route push)
      // has a sane screen underneath, then run the play chooser: native
      // player when the TV toggle is on, JS route otherwise.
      router.replace("/(auth)/(tabs)/(home)");
      void playMedia({ itemId: id, offline: false }, { item });
    })();
  }, [api, id, rootNavigationState?.key, router, playMedia, user?.Id]);

  return <View style={{ flex: 1, backgroundColor: "#000" }} />;
}
