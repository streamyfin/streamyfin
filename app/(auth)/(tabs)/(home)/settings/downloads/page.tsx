import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NextEpisodesSettings } from "@/components/settings/NextEpisodesSettings";

// Covered by components/settings/NextEpisodesSettings.test.tsx.
export default function DownloadSettingsPage() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: insets.bottom + 20,
      }}
    >
      <View
        className='p-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <NextEpisodesSettings />
      </View>
    </ScrollView>
  );
}
