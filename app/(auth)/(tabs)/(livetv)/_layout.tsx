import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import {
  commonScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";

export default function LiveTVLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerTitle: t("live_tv.title"),
          headerBlurEffect: "none",
          headerTransparent: false,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name='items/page' options={commonScreenOptions} />
    </Stack>
  );
}
