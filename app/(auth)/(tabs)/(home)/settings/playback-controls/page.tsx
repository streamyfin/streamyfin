import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureControls } from "@/components/settings/GestureControls";
import { MediaProvider } from "@/components/settings/MediaContext";
import { MediaToggles } from "@/components/settings/MediaToggles";
import { PlaybackControlsSettings } from "@/components/settings/PlaybackControlsSettings";
import { ChromecastSettings } from "../../../../../../components/settings/ChromecastSettings";

export default function PlaybackControlsPage() {
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
        <View className='mb-4'>
          <MediaProvider>
            <MediaToggles className='mb-4' />
            <GestureControls className='mb-4' />
            <PlaybackControlsSettings />
          </MediaProvider>
        </View>
        {!Platform.isTV && <ChromecastSettings />}
      </View>
    </ScrollView>
  );
}
