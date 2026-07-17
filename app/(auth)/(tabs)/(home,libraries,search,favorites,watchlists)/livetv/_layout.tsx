import { Slot, Stack, withLayoutContext } from "expo-router";
import {
  createMaterialTopTabNavigator,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from "expo-router/js-top-tabs";
import type {
  ParamListBase,
  TabNavigationState,
} from "expo-router/react-navigation";
import { Platform } from "react-native";

const { Navigator } = createMaterialTopTabNavigator();

export const Tab = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

const Layout = () => {
  // On TV, skip the Material Top Tab Navigator and render children directly
  // The TV version handles its own tab navigation internally
  if (Platform.isTV) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Slot />
      </>
    );
  }

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
