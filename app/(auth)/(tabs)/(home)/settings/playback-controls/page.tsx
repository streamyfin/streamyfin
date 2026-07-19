import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureControls } from "@/components/settings/GestureControls";
import { MediaProvider } from "@/components/settings/MediaContext";
import { MediaToggles } from "@/components/settings/MediaToggles";
import { MpvBufferSettings } from "@/components/settings/MpvBufferSettings";
import { MpvVoSettings } from "@/components/settings/MpvVoSettings";
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
        paddingBottom: insets.bottom,
      }}
    >
      <View
        className='p-4 flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <View>
          <MediaProvider>
            <MediaToggles className='mb-4' />
            <GestureControls className='mb-4' />
            <PlaybackControlsSettings />
            <MpvBufferSettings />
            <MpvVoSettings />
          </MediaProvider>
        </View>
        {!Platform.isTV && <ChromecastSettings />}
      </View>
    </ScrollView>
  );
}
