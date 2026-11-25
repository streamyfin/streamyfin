import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DownloadDefaultsSettings } from "@/components/settings/DownloadDefaultsSettings";

export default function DownloadDefaultsPage() {
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
        <DownloadDefaultsSettings />
      </View>
    </ScrollView>
  );
}
