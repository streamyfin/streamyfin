import { JellyseerrSettings } from "@/components/settings/Jellyseerr";
import { useSettings } from "@/utils/atoms/settings";
import DisabledSetting from "@/components/settings/DisabledSetting";

export default function page() {
  const [settings, updateSettings, pluginSettings] = useSettings();

  return (
    <DisabledSetting
      disabled={pluginSettings?.jellyseerrServerUrl?.locked === true}
      className="p-4"
    >
      <JellyseerrSettings />
    </DisabledSetting>
  );
}
