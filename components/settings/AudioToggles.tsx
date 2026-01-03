import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { Switch } from "react-native-gesture-handler";
import { useSettings } from "@/utils/atoms/settings";
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
      </ListGroup>
    </View>
  );
};
