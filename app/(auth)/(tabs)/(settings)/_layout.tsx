import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { androidTVFadeScreenOptions } from "@/components/stacks/NestedTabPageStack";

export default function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={androidTVFadeScreenOptions}>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerTitle: t("tabs.settings"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
