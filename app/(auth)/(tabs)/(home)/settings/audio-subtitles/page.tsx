import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudioToggles } from "@/components/settings/AudioToggles";
import { MediaProvider } from "@/components/settings/MediaContext";
import { MpvSubtitleSettings } from "@/components/settings/MpvSubtitleSettings";
import { SubtitleToggles } from "@/components/settings/SubtitleToggles";

export default function AudioSubtitlesPage() {
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
          <AudioToggles className='mb-4' />
          <SubtitleToggles className='mb-4' />
          <MpvSubtitleSettings className='mb-4' />
        </MediaProvider>
      </View>
    </ScrollView>
  );
}
