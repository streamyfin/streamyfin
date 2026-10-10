import { Stack } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useCallback, useState } from "react";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderButton } from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { SegmentedToggle } from "@/components/common/SegmentedToggle";
import { Favorites } from "@/components/home/Favorites";
import { StreamystatsWatchlists } from "@/components/watchlists/StreamystatsWatchlists";
import useRouter from "@/hooks/useAppRouter";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import {
  useWatchlistSource,
  useWatchlistSourceOptions,
} from "@/hooks/useWatchlistSource";
import { useSettings } from "@/utils/atoms/settings";
import { getWatchlistSources } from "@/utils/watchlistSources";

// Required, not imported: an import would put the TV view, and every TV
// component it uses, in the phone bundle too.
const TVWatchlists: typeof import("@/components/watchlists/TVWatchlists").TVWatchlists =
  Platform.isTV
    ? require("@/components/watchlists/TVWatchlists").TVWatchlists
    : null;

interface WatchlistsViewProps {
  streamystatsShown: boolean;
  kefinShown: boolean;
}

/** Shared KefinTweaks (Likes-backed) view — the favorites grid with a Likes filter. */
function KefinWatchlistView() {
  const insets = useSafeAreaInsets();
  // Pull to refresh, as on the Favorites tab: Likes also change from Jellyfin
  // web and KefinTweaks, which this screen cannot hear about.
  const invalidateCache = useInvalidatePlaybackProgressCache();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await invalidateCache();
    } finally {
      setRefreshing(false);
    }
  }, [invalidateCache]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 16,
      }}
    >
      <View style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}>
        <Favorites
          filter='Likes'
          queryKeyBase='watchlist'
          seeAllNamespace='kefintweaksWatchlist'
          seeAllPathname='/(auth)/(tabs)/(watchlists)/see-all'
          emptyTitleKey='kefintweaksWatchlist.noDataTitle'
          emptyTextKey='kefintweaksWatchlist.noData'
        />
      </View>
    </ScrollView>
  );
}

function MobileWatchlists({
  streamystatsShown,
  kefinShown,
}: WatchlistsViewProps) {
  const headerHeight = useHeaderHeight();
  const options = useWatchlistSourceOptions();
  const router = useRouter();
  const { activeSource, setSource, showToggle } = useWatchlistSource(
    streamystatsShown,
    kefinShown,
  );

  if (!streamystatsShown && !kefinShown) return null;

  const activeView =
    activeSource === "streamystats" ? (
      <StreamystatsWatchlists />
    ) : (
      <KefinWatchlistView />
    );

  // The "+" only creates Streamystats watchlists, so hide it whenever the
  // active view is KefinTweaks (Likes-backed, nothing to create).
  const headerRight =
    activeSource === "streamystats"
      ? () => (
          <HeaderButton
            onPress={() => router.push("/(auth)/(tabs)/(watchlists)/create")}
          >
            <HeaderIcon name='add' />
          </HeaderButton>
        )
      : undefined;

  return (
    <>
      <Stack.Screen options={{ headerRight }} />
      {showToggle ? (
        <View style={{ flex: 1 }}>
          {/* Clear the transparent iOS header; the Android header is opaque so
              content already starts below it. */}
          <View
            style={{
              paddingTop: Platform.OS === "ios" ? headerHeight : 10,
              paddingBottom: 8,
              paddingHorizontal: 16,
            }}
          >
            <SegmentedToggle
              options={options}
              value={activeSource}
              onChange={setSource}
            />
          </View>
          <View style={{ flex: 1 }}>{activeView}</View>
        </View>
      ) : (
        activeView
      )}
    </>
  );
}

/**
 * Watchlists tab. Hosts the Streamystats (plugin) watchlists and/or the
 * KefinTweaks (Likes-backed) watchlist depending on which is enabled:
 * - streamystats only  -> Streamystats list
 * - kefintweaks only   -> KefinTweaks grid
 * - both               -> Streamystats by default, with a source toggle
 * - neither            -> nothing (the tab is hidden upstream)
 *
 * `hideWatchlistsTab` suppresses only the Streamystats side (see `streamystatsShown`).
 */
export default function WatchlistsScreen() {
  const { settings } = useSettings();
  const { streamystats: streamystatsShown, kefin: kefinShown } =
    getWatchlistSources(settings);

  if (Platform.isTV) {
    return (
      <TVWatchlists
        streamystatsShown={streamystatsShown}
        kefinShown={kefinShown}
      />
    );
  }

  return (
    <MobileWatchlists
      streamystatsShown={streamystatsShown}
      kefinShown={kefinShown}
    />
  );
}
