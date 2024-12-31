import React from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";

import { withLayoutContext } from "expo-router";

import {
  createNativeBottomTabNavigator,
  NativeBottomTabNavigationEventMap,
} from "@bottom-tabs/react-navigation";

const { Navigator } = createNativeBottomTabNavigator();

import { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";

import { Colors } from "@/constants/Colors";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import { SystemBars } from "react-native-edge-to-edge";
import { useSettings } from "@/utils/atoms/settings";

export const NativeTabs = withLayoutContext<
  BottomTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(Navigator);

export default function TabLayout() {
  const [settings] = useSettings();
  const { t } = useTranslation();
  return (
    <>
      <SystemBars hidden={false} style="light" />
      <NativeTabs
        sidebarAdaptable
        ignoresTopSafeArea
        barTintColor={Platform.OS === "android" ? "#121212" : undefined}
        tabBarActiveTintColor={Colors.primary}
        scrollEdgeAppearance="default"
      >
        <NativeTabs.Screen redirect name="index" />
        <NativeTabs.Screen
          name="(home)"
          options={{
            title: t("tabs.home"),
            tabBarIcon:
              Platform.OS == "android"
                ? ({ color, focused, size }) =>
                    require("@/assets/icons/house.fill.png")
                : () => ({ sfSymbol: "house" }),
          }}
        />
        <NativeTabs.Screen
          name="(search)"
          options={{
            title: t("tabs.search"),
            tabBarIcon:
              Platform.OS == "android"
                ? ({ color, focused, size }) =>
                    require("@/assets/icons/magnifyingglass.png")
                : () => ({ sfSymbol: "magnifyingglass" }),
          }}
        />
        <NativeTabs.Screen
          name="(libraries)"
          options={{
            title: t("tabs.library"),
            tabBarIcon:
              Platform.OS == "android"
                ? ({ color, focused, size }) =>
                    require("@/assets/icons/server.rack.png")
                : () => ({ sfSymbol: "rectangle.stack" }),
          }}
        />
        <NativeTabs.Screen
          name="(custom-links)"
          options={{
            title: t("tabs.custom_links"),
            // @ts-expect-error
            tabBarItemHidden: settings?.showCustomMenuLinks ? false : true,
            tabBarIcon:
              Platform.OS == "android"
                ? () => require("@/assets/icons/list.png")
                : () => ({ sfSymbol: "list.dash" }),
          }}
        />
      </NativeTabs>
    </>
  );
}
