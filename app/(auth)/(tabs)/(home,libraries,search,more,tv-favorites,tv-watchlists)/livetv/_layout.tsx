import { Slot, Stack } from "expo-router";
import TopTabs from "expo-router/js-top-tabs";
import { Platform } from "react-native";

// Opens on Programs. Expo Router 58 dropped initialRouteName; without an
// anchor the tabs open on the first route by name, Channels.
export const unstable_settings = { anchor: "programs" };

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
      <TopTabs
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
        <TopTabs.Screen name='programs' />
        <TopTabs.Screen name='guide' />
        <TopTabs.Screen name='channels' />
        <TopTabs.Screen name='recordings' />
      </TopTabs>
    </>
  );
};

export default Layout;
