import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { androidTVFadeScreenOptions } from "@/components/stacks/NestedTabPageStack";

export default function CustomMenuLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={androidTVFadeScreenOptions}>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          headerLargeTitle: true,
          headerTitle: t("tabs.custom_links"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
