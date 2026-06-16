import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JellyseerrSettings } from "@/components/settings/Jellyseerr";

export default function JellyseerrPluginPage() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View className='p-4'>
        <JellyseerrSettings />
      </View>
    </ScrollView>
  );
}
