import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "../../common/Text";
import { ListItem } from "../../list/ListItem";
import { PlatformDropdown } from "../../PlatformDropdown";

interface Props {
  settings: any;
  updateSettings: (settings: any) => void;
  cultures?: any[];
}

export const SubtitleLanguageDropdown: React.FC<Props> = ({
  settings,
  updateSettings,
  cultures,
}) => {
  const { t } = useTranslation();

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

  return (
    <ListItem title={t("home.settings.subtitles.subtitle_language")}>
      <PlatformDropdown
        groups={subtitleLanguageOptionGroups}
        trigger={
          <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
            <Text className='mr-1 text-[#8E8D91]'>
              {settings?.defaultSubtitleLanguage?.DisplayName ||
                t("home.settings.subtitles.none")}
            </Text>
            <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
          </View>
        }
        title={t("home.settings.subtitles.language")}
      />
    </ListItem>
  );
};
