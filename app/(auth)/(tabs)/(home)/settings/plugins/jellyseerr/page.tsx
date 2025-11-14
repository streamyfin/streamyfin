import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { JellyseerrSettings } from "@/components/settings/Jellyseerr";
import { useSettings } from "@/utils/atoms/settings";

export default function page() {
  const { pluginSettings } = useSettings();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <DisabledSetting
        disabled={pluginSettings?.jellyseerrServerUrl?.locked === true}
        className='px-4'
      >
        <JellyseerrSettings />
      </DisabledSetting>
    </ScrollView>
  );
}
