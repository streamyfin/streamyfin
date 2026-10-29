import { Redirect, Stack, useSegments } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import type { TVNavBarTab } from "@/components/tv/TVNavBar";
import { TVNavBar } from "@/components/tv/TVNavBar";
import { Colors } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import {
  isAtTabRoot,
  isTabRoute,
  useTVHomeBackHandler,
  useTVTabRootBackHandler,
} from "@/hooks/useTVBackHandler";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";
import {
  isTVTabGone,
  showsWatchlists,
  type TVTabGroup,
  tvTabGroups,
} from "@/utils/tvTabs";

// Music components are not available on tvOS (TrackPlayer not supported)
const MiniPlayerBar = Platform.isTV
  ? () => null
  : require("@/components/music/MiniPlayerBar").MiniPlayerBar;
const MusicPlaybackEngine = Platform.isTV
  ? () => null
  : require("@/components/music/MusicPlaybackEngine").MusicPlaybackEngine;

// Catches render crashes inside the tab navigator before they bubble to the
// root boundary. The fallback replaces the whole navigator (tab bar
// included) and retry remounts it fresh, discarding navigation state — but
// the session, providers, and root layout survive.
export { RouteErrorBoundary as ErrorBoundary } from "@/components/RouteErrorBoundary";

// Both navigators below open on (home); Expo Router 58 reads the initial
// route from the layout's anchor rather than an initialRouteName prop.
export const unstable_settings = { anchor: "(home)" };

const IS_ANDROID_TV = Platform.isTV && Platform.OS === "android";

function TVTabLayout() {
  const { t } = useTranslation();
  const segments = useSegments();
  const router = useRouter();

  const currentTab = segments.find(isTabRoute);
  const atTabRoot = isAtTabRoot(segments);
  const { settings } = useSettings();
  const watchlists = showsWatchlists(settings);

  const tabs: TVNavBarTab[] = useMemo(() => {
    const labels: Record<TVTabGroup, string> = {
      "(home)": t("tabs.home"),
      "(search)": t("tabs.search"),
      "(tv-favorites)": t("tabs.favorites"),
      "(tv-watchlists)": t("watchlists.title"),
      "(libraries)": t("tabs.library"),
      "(tv-settings)": t("tabs.settings"),
    };
    return tvTabGroups(watchlists).map((key) => ({ key, label: labels[key] }));
  }, [t, watchlists]);

  const activeTabKey = currentTab ?? "(home)";

  const handleTabChange = useCallback(
    (key: string) => {
      if (key === currentTab) return;

      if (key === "(home)") eventBus.emit("scrollToTop");
      if (key === "(search)") eventBus.emit("searchTabPressed");

      router.replace(`/(auth)/(tabs)/${key}`);
    },
    [currentTab, router],
  );

  const navigateHome = useCallback(() => {
    router.replace("/(auth)/(tabs)/(home)");
  }, [router]);
  useTVTabRootBackHandler(navigateHome, atTabRoot, currentTab);

  // A settings refresh can take Watchlists out of the bar while it is open;
  // tvOS's native tabs handle that themselves, this JS bar does not.
  const tabGone = isTVTabGone(currentTab, watchlists);
  useEffect(() => {
    if (tabGone) navigateHome();
  }, [tabGone, navigateHome]);

  return (
    <View style={{ flex: 1 }}>
      <SystemBars hidden={false} style='light' />
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
      <TVNavBar
        tabs={tabs}
        activeTabKey={activeTabKey}
        onTabChange={handleTabChange}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
        }}
      />
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const segments = useSegments();

  // Must be called before any conditional return (rules of hooks)
  useTVHomeBackHandler();
  const { settings } = useSettings();
  const watchlists = showsWatchlists(settings);

  // "/" lands on this group's index route, and native tabs render only their
  // tabs: the app launched on a black screen. Send it to Home from here.
  if (segments.at(-1) === "(tabs)") {
    return <Redirect href='/(auth)/(tabs)/(home)' />;
  }

  if (IS_ANDROID_TV) {
    return <TVTabLayout />;
  }

  return (
    <View style={{ flex: 1 }}>
      <SystemBars hidden={false} style='light' />
      <NativeTabs
        sidebarAdaptable={false}
        backgroundColor='#121212'
        tintColor={Platform.isTV ? "#FFFFFF" : Colors.primary}
        indicatorColor='#392c3b'
      >
        <NativeTabs.Trigger
          name='(home)'
          listeners={{ tabPress: () => eventBus.emit("scrollToTop") }}
        >
          <NativeTabs.Trigger.Label>{t("tabs.home")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf='house.fill'
            src={require("@/assets/icons/house.fill.png")}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name='(search)'
          // On tvOS the search role turns the tab into a bare magnifier; without
          // it the tab keeps its label, as the TV bar always had.
          role={Platform.isTV ? undefined : "search"}
          listeners={{ tabPress: () => eventBus.emit("searchTabPressed") }}
        >
          <NativeTabs.Trigger.Label>
            {t("tabs.search")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf='magnifyingglass'
            src={require("@/assets/icons/magnifyingglass.png")}
          />
        </NativeTabs.Trigger>
        {/* The TV bar keeps every section as a tab (utils/tvTabs.ts).
            tvOS reports focus coming back to the selected tab as a repeated
            selection, which pops the tab to its root: a page with nothing to
            focus yet, such as a watchlist while it loads, sends focus there at
            once and closed before it showed. */}
        <NativeTabs.Trigger
          name='(tv-favorites)'
          hidden={!Platform.isTV}
          disablePopToTop
        >
          <NativeTabs.Trigger.Label>
            {t("tabs.favorites")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf='heart.fill' />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name='(tv-watchlists)'
          hidden={!Platform.isTV || !watchlists}
          disablePopToTop
        >
          <NativeTabs.Trigger.Label>
            {t("watchlists.title")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf='list.star' />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name='(libraries)'>
          <NativeTabs.Trigger.Label>
            {t("tabs.library")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf='rectangle.stack.fill'
            src={require("@/assets/icons/rectangle.stack.fill.png")}
          />
        </NativeTabs.Trigger>
        {/* Favorites, watchlists, downloads, custom links, sessions and
            settings: the phone bar keeps four tabs, the rest is in this menu. */}
        <NativeTabs.Trigger name='(more)' hidden={Platform.isTV}>
          <NativeTabs.Trigger.Label>{t("tabs.more")}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf='ellipsis'
            src={require("@/assets/icons/ellipsis.png")}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name='(tv-settings)'
          hidden={!Platform.isTV}
          disablePopToTop
        >
          <NativeTabs.Trigger.Label>
            {t("tabs.settings")}
          </NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf='gearshape.fill' />
        </NativeTabs.Trigger>
      </NativeTabs>
      <MiniPlayerBar />
      <MusicPlaybackEngine />
    </View>
  );
}
