import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncPlayPanel } from "@/components/syncplay/SyncPlayPanel";
import { TVPadding } from "@/constants/TVSizes";

/**
 * SyncPlay as a screen. Phones and tablets open the same panel in a sheet
 * (useSyncPlaySheet). TV comes here, where anything modal has to be a route.
 */
export default function SyncPlayScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const horizontal = Platform.isTV ? TVPadding.horizontal : 16;
  return (
    <>
      <Stack.Screen
        options={{
          title: t("syncplay.title"),
          headerShown: !Platform.isTV,
          headerTintColor: "white",
          headerStyle: { backgroundColor: "#000000" },
          headerTransparent: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <ScrollView
        testID='syncplay-screen'
        contentInsetAdjustmentBehavior='automatic'
        style={{ flex: 1, backgroundColor: "#000000" }}
        contentContainerStyle={{
          width: "100%",
          maxWidth: 760 + 2 * horizontal,
          alignSelf: "center",
          paddingTop: Platform.isTV ? insets.top + TVPadding.horizontal : 16,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left + horizontal,
          paddingRight: insets.right + horizontal,
        }}
      >
        <SyncPlayPanel />
      </ScrollView>
    </>
  );
}
