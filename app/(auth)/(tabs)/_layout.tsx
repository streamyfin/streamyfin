import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from "@bottom-tabs/react-navigation";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import { useFocusEffect, useRouter, withLayoutContext } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { Colors } from "@/constants/Colors";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";
import { storage } from "@/utils/mmkv";

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
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      const hasShownIntro = storage.getBoolean("hasShownIntro");
      if (!hasShownIntro) {
        const timer = setTimeout(() => {
          router.push("/intro/page");
        }, 1000);

        return () => {
          clearTimeout(timer);
        };
      }
    }, []),
  );

  return (
    <>
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
    </>
  );
}
