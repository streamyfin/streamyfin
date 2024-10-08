import { TabBarIcon } from "@/components/navigation/TabBarIcon";
import { Colors } from "@/constants/Colors";
import { BlurView } from "expo-blur";
import * as NavigationBar from "expo-navigation-bar";
import React, { useEffect } from "react";
import { Platform, StyleSheet } from "react-native";

import { withLayoutContext } from "expo-router";

import {
  createNativeBottomTabNavigator,
  NativeBottomTabNavigationEventMap,
  NativeBottomTabNavigationOptions,
} from "react-native-bottom-tabs/react-navigation";

const { Navigator } = createNativeBottomTabNavigator();

import { BottomTabNavigationOptions } from "@react-navigation/bottom-tabs";

import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";

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
    <NativeTabs sidebarAdaptable>
      <NativeTabs.Screen redirect name="index" />
      <NativeTabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: () => ({ sfSymbol: "house" }),
        }}
      />
      <NativeTabs.Screen
        name="(search)"
        options={{
          title: "Search",
          tabBarIcon: () => ({ sfSymbol: "magnifyingglass" }),
        }}
      />
      <NativeTabs.Screen
        name="(libraries)"
        options={{
          title: "Library",
          tabBarIcon: () => ({ sfSymbol: "server.rack" }),
        }}
      />
    </NativeTabs>
  );
}
