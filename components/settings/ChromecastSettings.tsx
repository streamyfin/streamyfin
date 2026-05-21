import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { View } from "react-native";
import { useSettings } from "@/utils/atoms/settings";
import type { ChromecastProfileMode } from "@/utils/casting/capabilities";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";

const PROFILE_LABELS: Record<ChromecastProfileMode, string> = {
  auto: "Automatic (recommended)",
  "force-hevc": "Force HEVC / H265",
  "force-h264": "Force H264",
};

export const ChromecastSettings: React.FC = ({ ...props }) => {
  const { settings, updateSettings } = useSettings();

  const profileOptions = useMemo(
    () => [
      {
        options: (
          ["auto", "force-hevc", "force-h264"] as ChromecastProfileMode[]
        ).map((mode) => ({
          type: "radio" as const,
          label: PROFILE_LABELS[mode],
          value: mode,
          selected: (settings.chromecastProfile ?? "auto") === mode,
          onPress: () => updateSettings({ chromecastProfile: mode }),
        })),
      },
    ],
    [settings.chromecastProfile, updateSettings],
  );

  return (
    <View {...props}>
      <ListGroup title={"Chromecast"}>
        <ListItem
          title={"Profile"}
          subtitle={
            "Automatic picks codecs per device. Override only if needed."
          }
        >
          <PlatformDropdown
            groups={profileOptions}
            title={"Chromecast profile"}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {PROFILE_LABELS[settings.chromecastProfile ?? "auto"]}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
