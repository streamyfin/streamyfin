import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

export default function CustomMenuLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name='index'
        options={{
          headerShown: Platform.OS !== "ios",
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
