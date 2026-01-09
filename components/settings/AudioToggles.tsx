import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { Switch } from "react-native-gesture-handler";
import { AudioTranscodeMode, useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";
import { useMedia } from "./MediaContext";

interface Props extends ViewProps {}

export const AudioToggles: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;

  const media = useMedia();
  const { pluginSettings } = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

  const optionGroups = useMemo(() => {
    const options = [
      {
        type: "radio" as const,
        label: t("home.settings.audio.none"),
        value: "none",
        selected: !settings?.defaultAudioLanguage,
        onPress: () => updateSettings({ defaultAudioLanguage: null }),
      },
      ...(cultures?.map((culture) => ({
        type: "radio" as const,
        label:
          culture.DisplayName ||
          culture.ThreeLetterISOLanguageName ||
          "Unknown",
        value:
          culture.ThreeLetterISOLanguageName ||
          culture.DisplayName ||
          "unknown",
        selected:
          culture.ThreeLetterISOLanguageName ===
          settings?.defaultAudioLanguage?.ThreeLetterISOLanguageName,
        onPress: () => updateSettings({ defaultAudioLanguage: culture }),
      })) || []),
    ];

    return [
      {
        options,
      },
    ];
  }, [cultures, settings?.defaultAudioLanguage, t, updateSettings]);

  const audioTranscodeModeLabels: Record<AudioTranscodeMode, string> = {
    [AudioTranscodeMode.Auto]: t("home.settings.audio.transcode_mode.auto"),
    [AudioTranscodeMode.ForceStereo]: t(
      "home.settings.audio.transcode_mode.stereo",
    ),
    [AudioTranscodeMode.Allow51]: t("home.settings.audio.transcode_mode.5_1"),
    [AudioTranscodeMode.AllowAll]: t(
      "home.settings.audio.transcode_mode.passthrough",
    ),
  };

  const audioTranscodeModeOptions = useMemo(
    () => [
      {
        options: [
          {
            type: "radio" as const,
            label: t("home.settings.audio.transcode_mode.auto"),
            value: AudioTranscodeMode.Auto,
            selected:
              settings?.audioTranscodeMode === AudioTranscodeMode.Auto ||
              !settings?.audioTranscodeMode,
            onPress: () =>
              updateSettings({ audioTranscodeMode: AudioTranscodeMode.Auto }),
          },
          {
            type: "radio" as const,
            label: t("home.settings.audio.transcode_mode.stereo"),
            value: AudioTranscodeMode.ForceStereo,
            selected:
              settings?.audioTranscodeMode === AudioTranscodeMode.ForceStereo,
            onPress: () =>
              updateSettings({
                audioTranscodeMode: AudioTranscodeMode.ForceStereo,
              }),
          },
          {
            type: "radio" as const,
            label: t("home.settings.audio.transcode_mode.5_1"),
            value: AudioTranscodeMode.Allow51,
            selected:
              settings?.audioTranscodeMode === AudioTranscodeMode.Allow51,
            onPress: () =>
              updateSettings({
                audioTranscodeMode: AudioTranscodeMode.Allow51,
              }),
          },
          {
            type: "radio" as const,
            label: t("home.settings.audio.transcode_mode.passthrough"),
            value: AudioTranscodeMode.AllowAll,
            selected:
              settings?.audioTranscodeMode === AudioTranscodeMode.AllowAll,
            onPress: () =>
              updateSettings({
                audioTranscodeMode: AudioTranscodeMode.AllowAll,
              }),
          },
        ],
      },
    ],
    [settings?.audioTranscodeMode, t, updateSettings],
  );

  if (isTv) return null;
  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.audio.audio_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.audio.audio_hint")}
          </Text>
        }
      >
        <ListItem
          title={t("home.settings.audio.set_audio_track")}
          disabled={pluginSettings?.rememberAudioSelections?.locked}
        >
          <Switch
            value={settings.rememberAudioSelections}
            disabled={pluginSettings?.rememberAudioSelections?.locked}
            onValueChange={(value) =>
              updateSettings({ rememberAudioSelections: value })
            }
          />
        </ListItem>
        <ListItem title={t("home.settings.audio.audio_language")}>
          <PlatformDropdown
            groups={optionGroups}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings?.defaultAudioLanguage?.DisplayName ||
                    t("home.settings.audio.none")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.audio.language")}
          />
        </ListItem>
        <ListItem
          title={t("home.settings.audio.transcode_mode.title")}
          subtitle={t("home.settings.audio.transcode_mode.description")}
        >
          <PlatformDropdown
            groups={audioTranscodeModeOptions}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {
                    audioTranscodeModeLabels[
                      settings?.audioTranscodeMode || AudioTranscodeMode.Auto
                    ]
                  }
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.audio.transcode_mode.title")}
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
