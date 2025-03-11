import React from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { withLayoutContext } from "expo-router";
import { Colors } from "@/constants/Colors";

const { Navigator } = createNativeStackNavigator();
const Stack = withLayoutContext(Navigator);

export default function TVLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: "#121212",
        },
        headerTintColor: Colors.primary,
        contentStyle: {
          backgroundColor: "#121212",
        },
        animation: "fade",
      }}
    >
      <Stack.Screen
        name="home"
        options={{
          title: t("tabs.home"),
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="search"
        options={{
          title: t("tabs.search"),
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="library"
        options={{
          title: t("tabs.library"),
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="favorites"
        options={{
          title: t("tabs.favorites"),
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          headerLargeTitle: true,
        }}
      />
    </Stack>
  );
}