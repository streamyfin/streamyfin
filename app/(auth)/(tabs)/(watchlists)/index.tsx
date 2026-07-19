import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SegmentedToggle } from "@/components/common/SegmentedToggle";
import { Favorites } from "@/components/home/Favorites";
import { Favorites as TVFavorites } from "@/components/home/Favorites.tv";
import { TVSegmentedControl } from "@/components/tv/TVSegmentedControl";
import { StreamystatsWatchlists } from "@/components/watchlists/StreamystatsWatchlists";
import useRouter from "@/hooks/useAppRouter";
import { useStreamystatsEnabled } from "@/hooks/useWatchlists";
import { useSettings } from "@/utils/atoms/settings";

const TV_TOP_PADDING = 100;
const TV_HORIZONTAL_PADDING = 60;

type WatchlistSource = "streamystats" | "kefin";

interface WatchlistsViewProps {
  streamystatsShown: boolean;
  kefinShown: boolean;
}

function useToggleOptions() {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        value: "streamystats" as const,
        label: t("watchlists.source_streamystats"),
      },
      { value: "kefin" as const, label: t("watchlists.source_kefintweaks") },
    ],
    [t],
  );
}

/**
 * Resolves which watchlist source is active given what's enabled. When both
 * are shown the user toggles between them (defaulting to Streamystats);
 * otherwise the single enabled source wins.
 */
function useWatchlistSource(streamystatsShown: boolean, kefinShown: boolean) {
  const showToggle = streamystatsShown && kefinShown;
  const [source, setSource] = useState<WatchlistSource>(
    streamystatsShown ? "streamystats" : "kefin",
  );

  const activeSource: WatchlistSource = showToggle
    ? source
    : streamystatsShown
      ? "streamystats"
      : "kefin";

  return { source, setSource, activeSource, showToggle };
}

/** Shared KefinTweaks (Likes-backed) view — the favorites grid with a Likes filter. */
function KefinWatchlistView() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
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
  const options = useToggleOptions();
  const router = useRouter();
  const { source, setSource, activeSource, showToggle } = useWatchlistSource(
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
          <Pressable
            onPress={() => router.push("/(auth)/(tabs)/(watchlists)/create")}
            className='p-1.5'
          >
            <Ionicons name='add' size={24} color='white' />
          </Pressable>
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
              value={source}
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

function TVWatchlists({ streamystatsShown, kefinShown }: WatchlistsViewProps) {
  const insets = useSafeAreaInsets();
  const options = useToggleOptions();
  const { source, setSource, activeSource, showToggle } = useWatchlistSource(
    streamystatsShown,
    kefinShown,
  );

  if (!streamystatsShown && !kefinShown) return null;

  if (!showToggle) {
    return activeSource === "streamystats" ? (
      <StreamystatsWatchlists />
    ) : (
      <TVFavorites
        filter='Likes'
        queryKeyBase='watchlist'
        emptyTitleKey='kefintweaksWatchlist.noDataTitle'
        emptyTextKey='kefintweaksWatchlist.noData'
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          paddingTop: insets.top + TV_TOP_PADDING,
          paddingHorizontal: TV_HORIZONTAL_PADDING,
        }}
      >
        <TVSegmentedControl
          options={options}
          value={source}
          onChange={setSource}
          hasTVPreferredFocus
        />
      </View>
      <View style={{ flex: 1 }}>
        {activeSource === "streamystats" ? (
          <StreamystatsWatchlists />
        ) : (
          <TVFavorites
            filter='Likes'
            queryKeyBase='watchlist'
            emptyTitleKey='kefintweaksWatchlist.noDataTitle'
            emptyTextKey='kefintweaksWatchlist.noData'
            isFirstSection={false}
            contentTopPadding={0}
          />
        )}
      </View>
    </View>
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
  const streamystatsShown =
    useStreamystatsEnabled() && !settings?.hideWatchlistsTab;
  const kefinShown = settings?.useKefinTweaks ?? false;

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
