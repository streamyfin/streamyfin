import type {
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import { Stack, withLayoutContext } from "expo-router";
import React from "react";

const { Navigator } = createMaterialTopTabNavigator();

export const Tab = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

const Layout = () => {
  return (
    <>
      <Stack.Screen options={{ title: "Live TV" }} />
      <Tab
        initialRouteName='programs'
        keyboardDismissMode='none'
        screenOptions={{
          tabBarBounces: true,
          tabBarLabelStyle: { fontSize: 10 },
          tabBarItemStyle: {
            width: 100,
          },
          tabBarStyle: { backgroundColor: "black" },
          animationEnabled: true,
          lazy: true,
          swipeEnabled: true,
          tabBarIndicatorStyle: { backgroundColor: "#9334E9" },
          tabBarScrollEnabled: true,
        }}
      >
        <Tab.Screen name='programs' />
        <Tab.Screen name='guide' />
        <Tab.Screen name='channels' />
        <Tab.Screen name='recordings' />
      </Tab>
    </>
  );
};

export default Layout;
