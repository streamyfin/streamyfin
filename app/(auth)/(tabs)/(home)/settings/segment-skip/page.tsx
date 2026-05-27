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
import { SegmentSkipMode, useSettings } from "@/utils/atoms/settings";

type SkipSettingKey =
  | "skipIntro"
  | "skipOutro"
  | "skipRecap"
  | "skipCommercial"
  | "skipPreview";

const SEGMENTS: ReadonlyArray<{ key: SkipSettingKey; labelKey: string }> = [
  { key: "skipIntro", labelKey: "skip_intro" },
  { key: "skipOutro", labelKey: "skip_outro" },
  { key: "skipRecap", labelKey: "skip_recap" },
  { key: "skipCommercial", labelKey: "skip_commercial" },
  { key: "skipPreview", labelKey: "skip_preview" },
];

const SEGMENT_SKIP_OPTIONS = (
  t: TFunction<"translation", undefined>,
): Array<{ label: string; value: SegmentSkipMode }> => [
  { label: t("home.settings.other.segment_skip_auto"), value: "auto" },
  { label: t("home.settings.other.segment_skip_ask"), value: "ask" },
  { label: t("home.settings.other.segment_skip_none"), value: "none" },
];

export default function SegmentSkipPage() {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { t } = useTranslation();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      title: t("home.settings.other.segment_skip_settings"),
    });
  }, [navigation, t]);

  const options = useMemo(() => SEGMENT_SKIP_OPTIONS(t), [t]);

  if (!settings) return null;

  return (
    <View className='px-4'>
      <ListGroup>
        {SEGMENTS.map(({ key, labelKey }) => {
          const current = settings[key];
          const locked = pluginSettings?.[key]?.locked ?? false;
          const groups = [
            {
              options: options.map((o) => ({
                type: "radio" as const,
                label: o.label,
                value: o.value,
                selected: o.value === current,
                disabled: locked,
                onPress: () => {
                  if (locked) return;
                  updateSettings({ [key]: o.value });
                },
              })),
            },
          ];
          return (
            <ListItem
              key={key}
              title={t(`home.settings.other.${labelKey}`)}
              subtitle={t(`home.settings.other.${labelKey}_description`)}
              disabled={locked}
            >
              <PlatformDropdown
                groups={groups}
                trigger={
                  <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                    <Text className='mr-1 text-[#8E8D91]'>
                      {t(`home.settings.other.segment_skip_${current}`)}
                    </Text>
                    <Ionicons
                      name='chevron-expand-sharp'
                      size={18}
                      color='#5A5960'
                    />
                  </View>
                }
                title={t(`home.settings.other.${labelKey}`)}
              />
            </ListItem>
          );
        })}
      </ListGroup>
    </View>
  );
}
