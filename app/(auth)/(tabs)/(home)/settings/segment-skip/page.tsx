import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "expo-router";
import { TFunction } from "i18next";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { useSettings } from "@/utils/atoms/settings";

/**
 * Factory function to create skip options for a specific segment type
 * Reduces code duplication across all 5 segment types
 */
const useSkipOptions = (
  settingKey:
    | "skipIntro"
    | "skipOutro"
    | "skipRecap"
    | "skipCommercial"
    | "skipPreview",
  settings: ReturnType<typeof useSettings>["settings"] | null,
  updateSettings: ReturnType<typeof useSettings>["updateSettings"],
  t: TFunction<"translation", undefined>,
) => {
  return useMemo(
    () => [
      {
        options: SEGMENT_SKIP_OPTIONS(t).map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.value,
          selected: option.value === settings?.[settingKey],
          onPress: () => updateSettings({ [settingKey]: option.value }),
        })),
      },
    ],
    [settings?.[settingKey], updateSettings, t, settingKey],
  );
};

export default function SegmentSkipPage() {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: t("home.settings.other.segment_skip_settings"),
    });
  }, [navigation, t]);

  const skipIntroOptions = useSkipOptions(
    "skipIntro",
    settings,
    updateSettings,
    t,
  );
  const skipOutroOptions = useSkipOptions(
    "skipOutro",
    settings,
    updateSettings,
    t,
  );
  const skipRecapOptions = useSkipOptions(
    "skipRecap",
    settings,
    updateSettings,
    t,
  );
  const skipCommercialOptions = useSkipOptions(
    "skipCommercial",
    settings,
    updateSettings,
    t,
  );
  const skipPreviewOptions = useSkipOptions(
    "skipPreview",
    settings,
    updateSettings,
    t,
  );

  if (!settings) return null;

  return (
    <DisabledSetting disabled={false} className='px-4'>
      <ListGroup>
        <ListItem
          title={t("home.settings.other.skip_intro")}
          subtitle={t("home.settings.other.skip_intro_description")}
          disabled={pluginSettings?.skipIntro?.locked}
        >
          <PlatformDropdown
            groups={skipIntroOptions}
            disabled={pluginSettings?.skipIntro?.locked}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(`home.settings.other.segment_skip_${settings.skipIntro}`)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.skip_intro")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.skip_outro")}
          subtitle={t("home.settings.other.skip_outro_description")}
          disabled={pluginSettings?.skipOutro?.locked}
        >
          <PlatformDropdown
            groups={skipOutroOptions}
            disabled={pluginSettings?.skipOutro?.locked}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(`home.settings.other.segment_skip_${settings.skipOutro}`)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.skip_outro")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.skip_recap")}
          subtitle={t("home.settings.other.skip_recap_description")}
          disabled={pluginSettings?.skipRecap?.locked}
        >
          <PlatformDropdown
            groups={skipRecapOptions}
            disabled={pluginSettings?.skipRecap?.locked}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(`home.settings.other.segment_skip_${settings.skipRecap}`)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.skip_recap")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.skip_commercial")}
          subtitle={t("home.settings.other.skip_commercial_description")}
          disabled={pluginSettings?.skipCommercial?.locked}
        >
          <PlatformDropdown
            groups={skipCommercialOptions}
            disabled={pluginSettings?.skipCommercial?.locked}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    `home.settings.other.segment_skip_${settings.skipCommercial}`,
                  )}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.skip_commercial")}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.other.skip_preview")}
          subtitle={t("home.settings.other.skip_preview_description")}
          disabled={pluginSettings?.skipPreview?.locked}
        >
          <PlatformDropdown
            groups={skipPreviewOptions}
            disabled={pluginSettings?.skipPreview?.locked}
            trigger={
              <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(
                    `home.settings.other.segment_skip_${settings.skipPreview}`,
                  )}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </View>
            }
            title={t("home.settings.other.skip_preview")}
          />
        </ListItem>
      </ListGroup>
    </DisabledSetting>
  );
}

const SEGMENT_SKIP_OPTIONS = (
  t: TFunction<"translation", undefined>,
): Array<{
  label: string;
  value: "none" | "ask" | "auto";
}> => [
  {
    label: t("home.settings.other.segment_skip_auto"),
    value: "auto",
  },
  {
    label: t("home.settings.other.segment_skip_ask"),
    value: "ask",
  },
  {
    label: t("home.settings.other.segment_skip_none"),
    value: "none",
  },
];
