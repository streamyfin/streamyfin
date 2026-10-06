import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncPlayManager } from "@/components/syncplay/SyncPlayManager";

export default function SyncPlayScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
        keyboardShouldPersistTaps='handled'
        contentInsetAdjustmentBehavior='automatic'
        style={{ flex: 1, backgroundColor: "#000000" }}
        contentContainerStyle={{
          paddingTop: Platform.isTV ? insets.top + 60 : 16,
          paddingBottom: insets.bottom + 32,
          paddingLeft: insets.left + (Platform.isTV ? 60 : 16),
          paddingRight: insets.right + (Platform.isTV ? 60 : 16),
        }}
      >
        <SyncPlayManager />
      </ScrollView>
    </>
  );
}
