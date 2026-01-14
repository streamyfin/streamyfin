import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { Switch } from "react-native-gesture-handler";
import { Stepper } from "@/components/inputs/Stepper";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";
import { useMedia } from "./MediaContext";

interface Props extends ViewProps {}

export const SubtitleToggles: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;

  const media = useMedia();
  const { pluginSettings } = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

  const subtitleModes = [
    SubtitlePlaybackMode.Default,
    SubtitlePlaybackMode.Smart,
    SubtitlePlaybackMode.OnlyForced,
    SubtitlePlaybackMode.Always,
    SubtitlePlaybackMode.None,
  ];

  const subtitleModeKeys = {
    [SubtitlePlaybackMode.Default]: "home.settings.subtitles.modes.Default",
    [SubtitlePlaybackMode.Smart]: "home.settings.subtitles.modes.Smart",
    [SubtitlePlaybackMode.OnlyForced]:
      "home.settings.subtitles.modes.OnlyForced",
    [SubtitlePlaybackMode.Always]: "home.settings.subtitles.modes.Always",
    [SubtitlePlaybackMode.None]: "home.settings.subtitles.modes.None",
  };

  const subtitleLanguageOptionGroups = useMemo(() => {
    const options = [
      {
        type: "radio" as const,
        label: t("home.settings.subtitles.none"),
        value: "none",
        selected: !settings?.defaultSubtitleLanguage,
        onPress: () => updateSettings({ defaultSubtitleLanguage: null }),
      },
      ...(cultures?.map((culture) => ({
        type: "radio" as const,
        label: culture.DisplayName || "Unknown",
        value:
          culture.ThreeLetterISOLanguageName ||
          culture.DisplayName ||
          "unknown",
        selected:
          culture.ThreeLetterISOLanguageName ===
          settings?.defaultSubtitleLanguage?.ThreeLetterISOLanguageName,
        onPress: () => updateSettings({ defaultSubtitleLanguage: culture }),
      })) || []),
    ];

    return [
      {
        options,
      },
    ];
  }, [cultures, settings?.defaultSubtitleLanguage, t, updateSettings]);

  const subtitleModeOptionGroups = useMemo(() => {
    const options = subtitleModes.map((mode) => ({
      type: "radio" as const,
      label: t(subtitleModeKeys[mode]) || String(mode),
      value: String(mode),
      selected: mode === settings?.subtitleMode,
      onPress: () => updateSettings({ subtitleMode: mode }),
    }));

    return [
      {
        options,
      },
    ];
  }, [settings?.subtitleMode, t, updateSettings]);

  if (isTv) return null;
  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.subtitles.subtitle_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.subtitles.subtitle_hint")}
          </Text>
        }
      >
        <ListItem title={t("home.settings.subtitles.subtitle_language")}>
          <PlatformDropdown
            groups={subtitleLanguageOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings?.defaultSubtitleLanguage?.DisplayName ||
                    t("home.settings.subtitles.none")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.language")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_mode")}
          disabled={pluginSettings?.subtitleMode?.locked}
        >
          <PlatformDropdown
            groups={subtitleModeOptionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(subtitleModeKeys[settings?.subtitleMode]) ||
                    t("home.settings.subtitles.loading")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.subtitles.subtitle_mode")}
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
            value={settings.subtitleSize / 100}
            disabled={pluginSettings?.subtitleSize?.locked}
            step={0.1}
            min={0.3}
            max={1.5}
            onUpdate={(value) =>
              updateSettings({ subtitleSize: Math.round(value * 100) })
            }
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
