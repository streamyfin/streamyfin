import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { HeaderBackButton } from "@/components/common/HeaderBackButton";

export default function LiveTVLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name='index'
        options={{
          headerShown: !Platform.isTV,
          title: t("tabs.live_tv"),
          headerBlurEffect: "none",
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='items/page'
        options={{
          title: "",
          headerShown: true,
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
          headerBlurEffect: "none",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
    </Stack>
  );
}
