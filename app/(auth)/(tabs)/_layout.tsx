import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from "@bottom-tabs/react-navigation";
import { Ionicons } from "@expo/vector-icons";
import { Stack, Tabs, useSegments, withLayoutContext } from "expo-router";
import type {
  ParamListBase,
  TabNavigationState,
} from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type ColorValue, Platform, View } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import type { TVNavBarTab } from "@/components/tv/TVNavBar";
import { TVNavBar } from "@/components/tv/TVNavBar";
import { Colors } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import {
  isTabRoute,
  useTVHomeBackHandler,
  useTVTabRootBackHandler,
} from "@/hooks/useTVBackHandler";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";

// Music components are not available on tvOS (TrackPlayer not supported)
const MiniPlayerBar = Platform.isTV
  ? () => null
  : require("@/components/music/MiniPlayerBar").MiniPlayerBar;
const MusicPlaybackEngine = Platform.isTV
  ? () => null
  : require("@/components/music/MusicPlaybackEngine").MusicPlaybackEngine;

const { Navigator } = createNativeBottomTabNavigator();

export const NativeTabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(Navigator);

const IS_ANDROID_TV = Platform.isTV && Platform.OS === "android";

function TVTabLayout() {
  const { settings } = useSettings();
  const { t } = useTranslation();
  const segments = useSegments();
  const router = useRouter();

  const currentTab = segments.find(isTabRoute);
  // Widened to string: once expo-router has generated typed routes, the
  // segment union no longer includes "index" and the comparison below is
  // rejected as non-overlapping.
  const lastSegment: string = segments[segments.length - 1] ?? "";
  const atTabRoot = isTabRoute(lastSegment) || lastSegment === "index";

  const tabs: TVNavBarTab[] = useMemo(
    () =>
      [
        { key: "(home)", label: t("tabs.home") },
        { key: "(search)", label: t("tabs.search") },
        { key: "(favorites)", label: t("tabs.favorites") },
        !settings?.streamyStatsServerUrl || settings?.hideWatchlistsTab
          ? null
          : { key: "(watchlists)", label: t("watchlists.title") },
        { key: "(libraries)", label: t("tabs.library") },
        !settings?.showCustomMenuLinks
          ? null
          : { key: "(custom-links)", label: t("tabs.custom_links") },
        { key: "(settings)", label: t("tabs.settings") },
      ].filter((tab): tab is TVNavBarTab => tab !== null),
    [
      settings?.streamyStatsServerUrl,
      settings?.hideWatchlistsTab,
      settings?.showCustomMenuLinks,
      t,
    ],
  );

  const activeTabKey = currentTab ?? "(home)";

  const visibleKeys = useMemo(
    () => new Set(tabs.map((tab) => tab.key)),
    [tabs],
  );

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

  // If current tab is no longer visible (setting changed), navigate to home
  useEffect(() => {
    if (!visibleKeys.has(activeTabKey) && activeTabKey !== "(home)") {
      router.replace("/(auth)/(tabs)/(home)");
    }
  }, [visibleKeys, activeTabKey, router]);

  return (
    <View style={{ flex: 1 }}>
      <SystemBars hidden={false} style='light' />
      <Stack
        screenOptions={{ headerShown: false, animation: "none" }}
        initialRouteName='(home)'
      >
        <Stack.Screen name='index' redirect />
      </Stack>
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

/**
 * Desktop (Electron) tab bar.
 *
 * @bottom-tabs/react-navigation drives the platform's native tab controller,
 * which has no browser equivalent, so the web build uses expo-router's JS
 * <Tabs> with vector icons instead of SF Symbols.
 */
function WebTabLayout() {
  const { settings } = useSettings();
  const { t } = useTranslation();

  const icon =
    (name: keyof typeof Ionicons.glyphMap) =>
    ({ color, size }: { color: ColorValue; size: number }) => (
      <Ionicons name={name} color={color as string} size={size} />
    );

  return (
    <Tabs
      // Without this the navigator starts on `index`, which renders null — the
      // window comes up blank until a tab is tapped. `href: null` only hides
      // the tab button; it does not stop the route being the initial one.
      initialRouteName='(home)'
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#121212", borderTopColor: "#262626" },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: "#9BA1A6",
      }}
    >
      {/* `redirect` is what the native layout uses to bounce the empty index
          route onto the first real tab. Without it the window opens on
          app/(auth)/(tabs)/index.tsx, which renders null — a blank page with a
          tab bar until something is tapped. */}
      <Tabs.Screen name='index' redirect options={{ href: null }} />
      <Tabs.Screen
        name='(home)'
        options={{ title: t("tabs.home"), tabBarIcon: icon("home") }}
      />
      <Tabs.Screen
        name='(search)'
        options={{ title: t("tabs.search"), tabBarIcon: icon("search") }}
      />
      <Tabs.Screen
        name='(favorites)'
        options={{ title: t("tabs.favorites"), tabBarIcon: icon("heart") }}
      />
      <Tabs.Screen
        name='(watchlists)'
        options={{
          title: t("watchlists.title"),
          tabBarIcon: icon("list"),
          href:
            !settings?.streamyStatsServerUrl || settings?.hideWatchlistsTab
              ? null
              : undefined,
        }}
      />
      <Tabs.Screen
        name='(libraries)'
        options={{ title: t("tabs.library"), tabBarIcon: icon("albums") }}
      />
      <Tabs.Screen
        name='(custom-links)'
        options={{
          title: t("tabs.custom_links"),
          tabBarIcon: icon("link"),
          href: settings?.showCustomMenuLinks ? undefined : null,
        }}
      />
      <Tabs.Screen name='(settings)' options={{ href: null }} />
    </Tabs>
  );
}

export default function TabLayout() {
  const { settings } = useSettings();
  const { t } = useTranslation();

  // Must be called before any conditional return (rules of hooks)
  useTVHomeBackHandler();

  if (Platform.OS === "web") {
    return <WebTabLayout />;
  }

  if (IS_ANDROID_TV) {
    return <TVTabLayout />;
  }

  return (
    <View style={{ flex: 1 }}>
      <SystemBars hidden={false} style='light' />
      <NativeTabs
        sidebarAdaptable={false}
        tabBarStyle={{
          backgroundColor: "#121212",
        }}
        tabBarActiveTintColor={Platform.isTV ? "#FFFFFF" : Colors.primary}
        activeIndicatorColor={"#392c3b"}
        scrollEdgeAppearance='default'
      >
        <NativeTabs.Screen redirect name='index' />
        <NativeTabs.Screen
          listeners={(_e) => ({
            tabPress: (_e) => {
              eventBus.emit("scrollToTop");
            },
          })}
          name='(home)'
          options={{
            title: t("tabs.home"),
            tabBarIcon:
              Platform.OS === "android"
                ? (_e) => require("@/assets/icons/house.fill.png")
                : (_e) => ({ sfSymbol: "house.fill" }),
          }}
        />
        <NativeTabs.Screen
          listeners={(_e) => ({
            tabPress: (_e) => {
              eventBus.emit("searchTabPressed");
            },
          })}
          name='(search)'
          options={{
            role: "search",
            title: t("tabs.search"),
            tabBarIcon:
              Platform.OS === "android"
                ? (_e) => require("@/assets/icons/magnifyingglass.png")
                : (_e) => ({ sfSymbol: "magnifyingglass" }),
          }}
        />
        <NativeTabs.Screen
          name='(favorites)'
          options={{
            title: t("tabs.favorites"),
            tabBarIcon:
              Platform.OS === "android"
                ? (_e) => require("@/assets/icons/heart.fill.png")
                : (_e) => ({ sfSymbol: "heart.fill" }),
          }}
        />
        <NativeTabs.Screen
          name='(watchlists)'
          options={{
            title: t("watchlists.title"),
            tabBarItemHidden:
              !settings?.streamyStatsServerUrl || settings?.hideWatchlistsTab,
            tabBarIcon:
              Platform.OS === "android"
                ? (_e) => require("@/assets/icons/list.star.png")
                : (_e) => ({ sfSymbol: "list.star" }),
          }}
        />
        <NativeTabs.Screen
          name='(libraries)'
          options={{
            title: t("tabs.library"),
            tabBarIcon:
              Platform.OS === "android"
                ? (_e) => require("@/assets/icons/rectangle.stack.fill.png")
                : (_e) => ({ sfSymbol: "rectangle.stack.fill" }),
          }}
        />
        <NativeTabs.Screen
          name='(custom-links)'
          options={{
            title: t("tabs.custom_links"),
            tabBarItemHidden: !settings?.showCustomMenuLinks,
            tabBarIcon:
              Platform.OS === "android"
                ? (_e) => require("@/assets/icons/link.png")
                : (_e) => ({ sfSymbol: "link" }),
          }}
        />
        <NativeTabs.Screen
          name='(settings)'
          options={{
            title: t("tabs.settings"),
            tabBarItemHidden: !Platform.isTV,
            tabBarIcon:
              Platform.OS === "android"
                ? (_e) => require("@/assets/icons/gearshape.fill.png")
                : (_e) => ({ sfSymbol: "gearshape.fill" }),
          }}
        />
      </NativeTabs>
      <MiniPlayerBar />
      <MusicPlaybackEngine />
    </View>
  );
}
