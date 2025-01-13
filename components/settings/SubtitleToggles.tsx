import { TouchableOpacity, View, ViewProps } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { useMedia } from "./MediaContext";
import { Switch } from "react-native-gesture-handler";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useTranslation } from "react-i18next";
import {useSettings} from "@/utils/atoms/settings";
import {Stepper} from "@/components/inputs/Stepper";
import Dropdown from "@/components/common/Dropdown";

interface Props extends ViewProps {}

export const SubtitleToggles: React.FC<Props> = ({ ...props }) => {
  const media = useMedia();
  const [_, __, pluginSettings] = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

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
        title={t("home.settings.subtitles.subtitle_title")}
        description={
          <Text className="text-[#8E8D91] text-xs">
            {t("home.settings.subtitles.subtitle_hint")}
          </Text>
        }
      >
        <ListItem title={t("home.settings.subtitles.subtitle_language")}>
          <Dropdown
            data={[{DisplayName: t("home.settings.subtitles.none"), ThreeLetterISOLanguageName: "none-subs" },...(cultures ?? [])]}
            keyExtractor={(item) => item?.ThreeLetterISOLanguageName ?? "unknown"}
            titleExtractor={(item) => item?.DisplayName}
            title={
              <TouchableOpacity className="flex flex-row items-center justify-between py-3 pl-3">
                <Text className="mr-1 text-[#8E8D91]">
                  {settings?.defaultSubtitleLanguage?.DisplayName || t("home.settings.subtitles.none")}
                </Text>
                <Ionicons
                  name="chevron-expand-sharp"
                  size={18}
                  color="#5A5960"
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.language")}
            onSelected={(defaultSubtitleLanguage) =>
              updateSettings({
                defaultSubtitleLanguage: defaultSubtitleLanguage.DisplayName === t("home.settings.subtitles.none")
                  ? null
                  : defaultSubtitleLanguage
              })
          }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_mode")}
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
                  {settings?.subtitleMode || t("home.settings.subtitles.loading")}
                </Text>
                <Ionicons
                  name="chevron-expand-sharp"
                  size={18}
                  color="#5A5960"
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.subtitle_mode")}
            onSelected={(subtitleMode) =>
              updateSettings({subtitleMode})
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.set_subtitle_track")}
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
          title={t("home.settings.subtitles.subtitle_size")}
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
