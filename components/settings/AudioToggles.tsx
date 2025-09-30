import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View, type ViewProps } from "react-native";
import { Switch } from "react-native-gesture-handler";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { type OptionGroup, PlatformOptionsMenu } from "../PlatformOptionsMenu";
import { useMedia } from "./MediaContext";

interface Props extends ViewProps {}

export const AudioToggles: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;
  const [open, setOpen] = useState(false);

  const media = useMedia();
  const { pluginSettings } = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

  const optionGroups: OptionGroup[] = useMemo(() => {
    const options = [
      {
        id: "none",
        type: "radio" as const,
        groupId: "audio-languages",
        label: t("home.settings.audio.none"),
        selected: !settings?.defaultAudioLanguage,
      },
      ...(cultures?.map((culture) => ({
        id:
          culture.ThreeLetterISOLanguageName ||
          culture.DisplayName ||
          "unknown",
        type: "radio" as const,
        groupId: "audio-languages",
        label:
          culture.DisplayName ||
          culture.ThreeLetterISOLanguageName ||
          "Unknown",
        selected:
          culture.ThreeLetterISOLanguageName ===
          settings?.defaultAudioLanguage?.ThreeLetterISOLanguageName,
      })) || []),
    ];

    return [
      {
        id: "audio-languages",
        title: t("home.settings.audio.language"),
        options,
      },
    ];
  }, [cultures, settings?.defaultAudioLanguage, t]);

  const handleOptionSelect = (optionId: string) => {
    if (optionId === "none") {
      updateSettings({ defaultAudioLanguage: null });
    } else {
      const selectedCulture = cultures?.find(
        (culture) =>
          (culture.ThreeLetterISOLanguageName || culture.DisplayName) ===
          optionId,
      );
      if (selectedCulture) {
        updateSettings({ defaultAudioLanguage: selectedCulture });
      }
    }
    setOpen(false);
  };

  const trigger = (
    <TouchableOpacity
      className='flex flex-row items-center justify-between py-3 pl-3'
      onPress={() => setOpen(true)}
    >
      <Text className='mr-1 text-[#8E8D91]'>
        {settings?.defaultAudioLanguage?.DisplayName ||
          t("home.settings.audio.none")}
      </Text>
      <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
    </TouchableOpacity>
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
          <PlatformOptionsMenu
            groups={optionGroups}
            trigger={trigger}
            title={t("home.settings.audio.language")}
            open={open}
            onOpenChange={setOpen}
            onOptionSelect={handleOptionSelect}
            expoUIConfig={{
              hostStyle: { flex: 1 },
            }}
            bottomSheetConfig={{
              enableDynamicSizing: true,
              enablePanDownToClose: true,
            }}
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
