import DisabledSetting from "@/components/settings/DisabledSetting";
import { JellyseerrSettings } from "@/components/settings/Jellyseerr";
import { useSettings } from "@/utils/atoms/settings";

export default function page() {
  const { pluginSettings } = useSettings();

  return (
    <DisabledSetting
      disabled={pluginSettings?.jellyseerrServerUrl?.locked === true}
      className='p-4'
    >
      <JellyseerrSettings />
    </DisabledSetting>
  );
}
