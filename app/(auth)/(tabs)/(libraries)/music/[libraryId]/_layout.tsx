import {
  createMaterialTopTabNavigator,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
import { Stack, useLocalSearchParams, withLayoutContext } from "expo-router";
import { useTranslation } from "react-i18next";

const { Navigator } = createMaterialTopTabNavigator();

export const Tab = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

const Layout = () => {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t("music.title") }} />
      <Tab
        initialRouteName='suggestions'
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
        <Tab.Screen
          name='suggestions'
          initialParams={{ libraryId }}
          options={{ title: t("music.tabs.suggestions") }}
        />
        <Tab.Screen
          name='albums'
          initialParams={{ libraryId }}
          options={{ title: t("music.tabs.albums") }}
        />
        <Tab.Screen
          name='artists'
          initialParams={{ libraryId }}
          options={{ title: t("music.tabs.artists") }}
        />
        <Tab.Screen
          name='playlists'
          initialParams={{ libraryId }}
          options={{ title: t("music.tabs.playlists") }}
        />
      </Tab>
    </>
  );
};

export default Layout;
