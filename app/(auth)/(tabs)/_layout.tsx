import { TabBarIcon } from "@/components/navigation/TabBarIcon";
import { Colors } from "@/constants/Colors";
import { BlurView } from "expo-blur";
import * as NavigationBar from "expo-navigation-bar";
import React, { useEffect } from "react";
import { Platform, StyleSheet } from "react-native";

import {
  createNativeBottomTabNavigator,
  BottomSheetNavigationOptions,
} from "react-native-bottom-tabs/react-navigation";

import { withLayoutContext } from "expo-router";

const { Navigator } = createNativeBottomTabNavigator();

export const Tabs = withLayoutContext<any, typeof Navigator, any, any>(
  Navigator
);

export default function TabLayout() {
  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBackgroundColorAsync("#121212");
      NavigationBar.setBorderColorAsync("#121212");
    }
  }, []);

  return (
    <Tabs
      sidebarAdaptable
      options={{
        headerShown: false,
      }}
    >
      <Tabs.Screen redirect name="index" />
      <Tabs.Screen
        name="(home)"
        options={{
          title: "Home",
          tabBarIcon: () => ({ sfSymbol: "house" }),
        }}
      />
      <Tabs.Screen
        name="(search)"
        options={{
          title: "Search",
          tabBarIcon: () => ({ sfSymbol: "magnifyingglass" }),
        }}
      />
      <Tabs.Screen
        name="(libraries)"
        options={{
          title: "Library",
          tabBarIcon: () => ({ sfSymbol: "server.rack" }),
        }}
      />
    </Tabs>
  );
}
