import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MediaProvider } from "@/components/settings/MediaContext";
import { SubtitleToggles } from "@/components/settings/SubtitleToggles";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";

export default function AudioSubtitlesPage() {
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
      <View
        className='p-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <MediaProvider>
          <SubtitleToggles className='mb-4' />
        </MediaProvider>
      </View>
    </ScrollView>
  );
}
