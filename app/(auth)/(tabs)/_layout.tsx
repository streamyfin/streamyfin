import React from "react";
import { Platform } from "react-native";

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
            title: "Home",
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
            title: "Search",
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
            title: "Library",
            tabBarIcon:
              Platform.OS == "android"
                ? ({ color, focused, size }) =>
                    require("@/assets/icons/server.rack.png")
                : () => ({ sfSymbol: "rectangle.stack" }),
          }}
        />
      </NativeTabs>
    </>
  );
}
