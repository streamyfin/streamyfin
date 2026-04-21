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
  pluginSettings?: any;
}

export const SubtitleFontDropdown: React.FC<Props> = ({
  settings,
  updateSettings,
  pluginSettings,
}) => {
  const { t } = useTranslation();

  const fontOptions = [
    { label: "System", value: "System" },
    { label: "Sans-Serif", value: "sans-serif" },
    { label: "Serif", value: "serif" },
    { label: "Monospace", value: "monospace" },
  ];

  const fontOptionGroups = useMemo(() => {
    const options = fontOptions.map((font) => ({
      type: "radio" as const,
      label: font.label,
      value: font.value,
      selected: font.value === settings?.subtitleFont,
      onPress: () => updateSettings({ subtitleFont: font.value }),
    }));

    return [
      {
        options,
      },
    ];
  }, [settings?.subtitleFont, updateSettings]);

  return (
    <ListItem
      title={t("home.settings.subtitles.subtitle_font")}
      disabled={pluginSettings?.subtitleFont?.locked}
    >
      <PlatformDropdown
        groups={fontOptionGroups}
        trigger={
          <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
            <Text className='mr-1 text-[#8E8D91]'>
              {fontOptions.find((f) => f.value === settings?.subtitleFont)
                ?.label || "System"}
            </Text>
            <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
          </View>
        }
        title={t("home.settings.subtitles.subtitle_font")}
      />
    </ListItem>
  );
};
