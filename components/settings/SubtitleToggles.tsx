import { TouchableOpacity, View, ViewProps } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { useMedia } from "./MediaContext";
import { Switch } from "react-native-gesture-handler";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import {useSettings} from "@/utils/atoms/settings";
import {Stepper} from "@/components/inputs/Stepper";
import Dropdown from "@/components/common/Dropdown";

interface Props extends ViewProps {}

export const SubtitleToggles: React.FC<Props> = ({ ...props }) => {
  const media = useMedia();
  const [_, __, pluginSettings] = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;

  if (!settings) return null;

  const subtitleModes = [
    SubtitlePlaybackMode.Default,
    SubtitlePlaybackMode.Smart,
    SubtitlePlaybackMode.OnlyForced,
    SubtitlePlaybackMode.Always,
    SubtitlePlaybackMode.None,
  ];

  return (
    <View {...props}>
      <ListGroup
        title={"Subtitles"}
        description={
          <Text className="text-[#8E8D91] text-xs">
            Configure subtitle preferences.
          </Text>
        }
      >
        <ListItem title="Subtitle language">
          <Dropdown
            data={[{DisplayName: "None", ThreeLetterISOLanguageName: "none-subs" },...(cultures ?? [])]}
            keyExtractor={(item) => item?.ThreeLetterISOLanguageName ?? "unknown"}
            titleExtractor={(item) => item?.DisplayName}
            title={
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings?.defaultSubtitleLanguage?.DisplayName || "None"}
                </Text>
                <Ionicons
                  name="chevron-expand-sharp"
                  size={18}
                  color="#5A5960"
                />
              </TouchableOpacity>
            }
            label="Languages"
            onSelected={(defaultSubtitleLanguage) =>
              updateSettings({
                defaultSubtitleLanguage: defaultSubtitleLanguage.DisplayName === "None"
                  ? null
                  : defaultSubtitleLanguage
              })
          }
          />
        </ListItem>

        <ListItem
          title="Subtitle Mode"
          disabled={pluginSettings?.subtitleMode?.locked}
        >
          <Dropdown
            data={subtitleModes}
            disabled={pluginSettings?.subtitleMode?.locked}
            keyExtractor={String}
            titleExtractor={String}
            title={
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings?.subtitleMode || "Loading"}
                </Text>
                <Ionicons
                  name="chevron-expand-sharp"
                  size={18}
                  color="#5A5960"
                />
              </TouchableOpacity>
            }
            label="Subtitle Mode"
            onSelected={(subtitleMode) =>
              updateSettings({subtitleMode})
            }
          />
        </ListItem>

        <ListItem
          title="Set Subtitle Track From Previous Item"
          disabled={pluginSettings?.rememberSubtitleSelections?.locked}
        >
          <Switch
            value={settings.rememberSubtitleSelections}
            disabled={pluginSettings?.rememberSubtitleSelections?.locked}
            onValueChange={(value) =>
              updateSettings({ rememberSubtitleSelections: value })
            }
          />
        </ListItem>

        <ListItem
          title="Subtitle Size"
          disabled={pluginSettings?.subtitleSize?.locked}
        >
          <Stepper
            value={settings.subtitleSize}
            disabled={pluginSettings?.subtitleSize?.locked}
            step={5}
            min={0}
            max={120}
            onUpdate={(subtitleSize) => updateSettings({subtitleSize})}
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
