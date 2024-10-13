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
    <NativeTabs sidebarAdaptable ignoresTopSafeArea>
      <NativeTabs.Screen redirect name="index" />
      <NativeTabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused, size }) =>
            require("@/assets/icons/house.fill.png"),
        }}
      />
      <NativeTabs.Screen
        name="(search)"
        options={{
          title: "Search",
          tabBarIcon: ({ color, focused, size }) =>
            require("@/assets/icons/magnifyingglass.png"),
        }}
      />
      <NativeTabs.Screen
        name="(libraries)"
        options={{
          title: "Library",
          tabBarIcon: ({ color, focused, size }) =>
            require("@/assets/icons/server.rack.png"),
        }}
      />
    </NativeTabs>
  );
}
