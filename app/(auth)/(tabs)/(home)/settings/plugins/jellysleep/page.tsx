import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JellysleepSettings } from "@/components/settings/JellysleepSettings";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";

export default function JellysleepPluginPage() {
  useDismissKeyboardOnLeave();
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
        <JellysleepSettings />
      </View>
    </ScrollView>
  );
}
