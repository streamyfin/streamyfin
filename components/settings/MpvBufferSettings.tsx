import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Stepper } from "@/components/inputs/Stepper";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { type MpvCacheMode, useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const CACHE_MODE_OPTIONS: { key: string; value: MpvCacheMode }[] = [
  { key: "home.settings.buffer.cache_auto", value: "auto" },
  { key: "home.settings.buffer.cache_yes", value: "yes" },
  { key: "home.settings.buffer.cache_no", value: "no" },
];

export const MpvBufferSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  const cacheModeOptions = useMemo(
    () => [
      {
        options: CACHE_MODE_OPTIONS.map((option) => ({
          type: "radio" as const,
          label: t(option.key),
          value: option.value,
          selected: option.value === (settings?.mpvCacheEnabled ?? "auto"),
          onPress: () => updateSettings({ mpvCacheEnabled: option.value }),
        })),
      },
    ],
    [settings?.mpvCacheEnabled, t, updateSettings],
  );

  const currentCacheModeLabel = useMemo(() => {
    const option = CACHE_MODE_OPTIONS.find(
      (o) => o.value === (settings?.mpvCacheEnabled ?? "auto"),
    );
    return option ? t(option.key) : t("home.settings.buffer.cache_auto");
  }, [settings?.mpvCacheEnabled, t]);

  if (!settings) return null;

  return (
    <ListGroup title={t("home.settings.buffer.title")} className='mb-4'>
      <ListItem title={t("home.settings.buffer.cache_mode")}>
        <PlatformDropdown
          groups={cacheModeOptions}
          trigger={
            <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
              <Text className='mr-1 text-[#8E8D91]'>
                {currentCacheModeLabel}
              </Text>
              <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
            </View>
          }
          title={t("home.settings.buffer.cache_mode")}
        />
      </ListItem>

      <ListItem title={t("home.settings.buffer.buffer_duration")}>
        <Stepper
          value={settings.mpvCacheSeconds ?? 10}
          step={5}
          min={5}
          max={120}
          onUpdate={(value) => updateSettings({ mpvCacheSeconds: value })}
          appendValue='s'
        />
      </ListItem>

      <ListItem title={t("home.settings.buffer.max_cache_size")}>
        <Stepper
          value={settings.mpvDemuxerMaxBytes ?? 150}
          step={25}
          min={50}
          max={500}
          onUpdate={(value) => updateSettings({ mpvDemuxerMaxBytes: value })}
          appendValue=' MB'
        />
      </ListItem>

      <ListItem title={t("home.settings.buffer.max_backward_cache")}>
        <Stepper
          value={settings.mpvDemuxerMaxBackBytes ?? 50}
          step={25}
          min={25}
          max={200}
          onUpdate={(value) =>
            updateSettings({ mpvDemuxerMaxBackBytes: value })
          }
          appendValue=' MB'
        />
      </ListItem>
    </ListGroup>
  );
};
