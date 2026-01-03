import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { KefinTweaksSettings } from "@/components/settings/KefinTweaks";
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
        disabled={pluginSettings?.useKefinTweaks?.locked === true}
        className='px-4'
      >
        <KefinTweaksSettings />
      </DisabledSetting>
    </ScrollView>
  );
}
