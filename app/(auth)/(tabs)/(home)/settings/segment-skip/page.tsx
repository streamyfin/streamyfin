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

export default function SegmentSkipPage() {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: t("home.settings.other.segment_skip_settings"),
    });
  }, [navigation, t]);

  const skipIntroOptions = useMemo(
    () => [
      {
        options: SEGMENT_SKIP_OPTIONS(t).map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.value,
          selected: option.value === settings.skipIntro,
          onPress: () => updateSettings({ skipIntro: option.value }),
        })),
      },
    ],
    [settings.skipIntro, updateSettings, t],
  );

  const skipOutroOptions = useMemo(
    () => [
      {
        options: SEGMENT_SKIP_OPTIONS(t).map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.value,
          selected: option.value === settings.skipOutro,
          onPress: () => updateSettings({ skipOutro: option.value }),
        })),
      },
    ],
    [settings.skipOutro, updateSettings, t],
  );

  const skipRecapOptions = useMemo(
    () => [
      {
        options: SEGMENT_SKIP_OPTIONS(t).map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.value,
          selected: option.value === settings.skipRecap,
          onPress: () => updateSettings({ skipRecap: option.value }),
        })),
      },
    ],
    [settings.skipRecap, updateSettings, t],
  );

  const skipCommercialOptions = useMemo(
    () => [
      {
        options: SEGMENT_SKIP_OPTIONS(t).map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.value,
          selected: option.value === settings.skipCommercial,
          onPress: () => updateSettings({ skipCommercial: option.value }),
        })),
      },
    ],
    [settings.skipCommercial, updateSettings, t],
  );

  const skipPreviewOptions = useMemo(
    () => [
      {
        options: SEGMENT_SKIP_OPTIONS(t).map((option) => ({
          type: "radio" as const,
          label: option.label,
          value: option.value,
          selected: option.value === settings.skipPreview,
          onPress: () => updateSettings({ skipPreview: option.value }),
        })),
      },
    ],
    [settings.skipPreview, updateSettings, t],
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
    label: t("home.settings.other.segment_skip_none"),
    value: "none",
  },
  {
    label: t("home.settings.other.segment_skip_ask"),
    value: "ask",
  },
  {
    label: t("home.settings.other.segment_skip_auto"),
    value: "auto",
  },
];
