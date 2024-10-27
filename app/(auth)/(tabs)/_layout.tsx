import * as NavigationBar from "expo-navigation-bar";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";

import { withLayoutContext } from "expo-router";

import {
  createNativeBottomTabNavigator,
  NativeBottomTabNavigationEventMap,
} from "react-native-bottom-tabs/react-navigation";

const { Navigator } = createNativeBottomTabNavigator();

import { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";

import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import {} from "@expo/vector-icons/Ionicons";
import { Colors } from "@/constants/Colors";

export const NativeTabs = withLayoutContext<
  BottomTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(Navigator);

export default function TabLayout() {
  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBackgroundColorAsync("#121212");
      NavigationBar.setBorderColorAsync("#121212");
    }
  }, []);

  return (
    <NativeTabs
      sidebarAdaptable
      ignoresTopSafeArea
      barTintColor={"#121212"}
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
  );
}
