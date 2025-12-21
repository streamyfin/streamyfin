import DisabledSetting from "@/components/settings/DisabledSetting";
import { JellysleepSettings } from "@/components/settings/JellysleepSettings";
import { useSettings } from "@/utils/atoms/settings";

export default function page() {
  const { pluginSettings } = useSettings();

  return (
    <DisabledSetting
      disabled={pluginSettings?.jellysleepEnabled?.locked === true}
      className='p-4'
    >
      <JellysleepSettings />
    </DisabledSetting>
  );
}
