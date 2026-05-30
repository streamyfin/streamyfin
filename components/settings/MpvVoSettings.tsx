import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { type MpvVoDriver, useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const VO_DRIVER_OPTIONS: { key: string; value: MpvVoDriver }[] = [
  { key: "home.settings.vo_driver.gpu_next", value: "gpu-next" },
  { key: "home.settings.vo_driver.gpu", value: "gpu" },
];

export const MpvVoSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();

  const voDriverOptions = useMemo(
    () => [
      {
        options: VO_DRIVER_OPTIONS.map((option) => ({
          type: "radio" as const,
          label: t(option.key),
          value: option.value,
          selected: option.value === (settings?.mpvVoDriver ?? "gpu-next"),
          onPress: () => updateSettings({ mpvVoDriver: option.value }),
        })),
      },
    ],
    [settings?.mpvVoDriver, t, updateSettings],
  );

  const currentVoDriverLabel = useMemo(() => {
    const option = VO_DRIVER_OPTIONS.find(
      (o) => o.value === (settings?.mpvVoDriver ?? "gpu-next"),
    );
    return option ? t(option.key) : t("home.settings.vo_driver.gpu_next");
  }, [settings?.mpvVoDriver, t]);

  // Only show on Android
  if (Platform.OS !== "android") return null;

  if (!settings) return null;

  return (
    <ListGroup title={t("home.settings.vo_driver.title")} className='mb-4'>
      <ListItem title={t("home.settings.vo_driver.vo_mode")}>
        <PlatformDropdown
          groups={voDriverOptions}
          trigger={
            <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
              <Text className='mr-1 text-[#8E8D91]'>
                {currentVoDriverLabel}
              </Text>
              <Ionicons name='chevron-expand-sharp' size={18} color='#5A5960' />
            </View>
          }
          title={t("home.settings.vo_driver.vo_mode")}
        />
      </ListItem>
    </ListGroup>
  );
};
