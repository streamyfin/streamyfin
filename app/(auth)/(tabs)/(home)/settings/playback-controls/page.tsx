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
      }}
    >
      <View
        className='p-4'
        style={{ gap: 16, paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        <MediaProvider>
          <MediaToggles />
          <GestureControls />
          <PlaybackControlsSettings />
          <MpvBufferSettings />
          <MpvVoSettings />
        </MediaProvider>
        {!Platform.isTV && <ChromecastSettings />}
      </View>
    </ScrollView>
  );
}
