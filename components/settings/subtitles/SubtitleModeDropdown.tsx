import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "../../common/Text";
import { ListItem } from "../../list/ListItem";
import { PlatformDropdown } from "../../PlatformDropdown";

interface Props {
  settings: any;
  updateSettings: (settings: any) => void;
  pluginSettings?: any;
}

export const SubtitleModeDropdown: React.FC<Props> = ({
  settings,
  updateSettings,
  pluginSettings,
}) => {
  const { t } = useTranslation();

  const subtitleModes = [
    SubtitlePlaybackMode.Default,
    SubtitlePlaybackMode.Smart,
    SubtitlePlaybackMode.OnlyForced,
    SubtitlePlaybackMode.Always,
    SubtitlePlaybackMode.None,
  ];

  const subtitleModeKeys: Record<string, string> = {
    [SubtitlePlaybackMode.Default]: "home.settings.subtitles.modes.Default",
    [SubtitlePlaybackMode.Smart]: "home.settings.subtitles.modes.Smart",
    [SubtitlePlaybackMode.OnlyForced]:
      "home.settings.subtitles.modes.OnlyForced",
    [SubtitlePlaybackMode.Always]: "home.settings.subtitles.modes.Always",
    [SubtitlePlaybackMode.None]: "home.settings.subtitles.modes.None",
  };

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

  return (
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
            <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
          </View>
        }
        title={t("home.settings.subtitles.subtitle_mode")}
      />
    </ListItem>
  );
};
