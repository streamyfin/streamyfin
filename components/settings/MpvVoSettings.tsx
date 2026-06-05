import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { SettingsSelectRow } from "@/components/settings/index/SettingsSelectRow";
import { type MpvVoDriver, useSettings } from "@/utils/atoms/settings";
import { ListGroup } from "../list/ListGroup";

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
    <ListGroup title={t("home.settings.vo_driver.title")}>
      <SettingsSelectRow
        title={t("home.settings.vo_driver.vo_mode")}
        valueLabel={currentVoDriverLabel}
        groups={voDriverOptions}
        dropdownTitle={t("home.settings.vo_driver.vo_mode")}
      />
    </ListGroup>
  );
};
