import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from "@bottom-tabs/react-navigation";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import { withLayoutContext } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { MiniPlayerBar } from "@/components/music/MiniPlayerBar";
import { MusicPlaybackEngine } from "@/components/music/MusicPlaybackEngine";
import { Colors } from "@/constants/Colors";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";

const { Navigator } = createNativeBottomTabNavigator();

export const NativeTabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(Navigator);

export default function TabLayout() {
  const { settings } = useSettings();
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1 }}>
      <SystemBars hidden={false} style='light' />
      <NativeTabs
        sidebarAdaptable={false}
        tabBarStyle={{
          backgroundColor: "#121212",
        }}
        tabBarActiveTintColor={Colors.primary}
        activeIndicatorColor={"#392c3b"}
        scrollEdgeAppearance='default'
      >
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
                ? (_e) => require("@/assets/icons/list.png")
                : (_e) => ({ sfSymbol: "list.bullet.rectangle" }),
          }}
        />
        <NativeTabs.Screen
          name='(libraries)'
          options={{
            title: t("tabs.library"),
            tabBarIcon:
              Platform.OS === "android"
                ? (_e) => require("@/assets/icons/server.rack.png")
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
                ? (_e) => require("@/assets/icons/list.png")
                : (_e) => ({ sfSymbol: "list.dash.fill" }),
          }}
        />
      </NativeTabs>
      <MiniPlayerBar />
      <MusicPlaybackEngine />
    </View>
  );
}
