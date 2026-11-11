import type React from "react";
import { useTranslation } from "react-i18next";
import { TVSettingsOptionButton, TVSettingsToggle } from "@/components/tv";
import {
  AUTO_BITRATE_IN_NETWORK_MIN_CHOICES,
  AUTO_BITRATE_RATIO_CHOICES,
  AUTO_BITRATE_TTL_CHOICES,
} from "@/constants/Bitrate";
import { useAutoBitrateMeasure } from "@/hooks/useAutoBitrateMeasure";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { useSettings } from "@/utils/atoms/settings";
import {
  autoBitrateFloorLabel,
  autoBitrateRatioLabel,
  autoBitrateTtlLabel,
  lastMeasureLabel,
} from "@/utils/autoBitrateLabels";

/**
 * The Auto settings of the TV settings page, as the phone has them in its
 * playback settings: Auto plays on TV as well.
 */
export const TVAutoQualitySettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { t, i18n } = useTranslation();
  const { showOptions } = useTVOptionModal();
  const { last, measuring, measure } = useAutoBitrateMeasure();

  if (!settings) return null;

  const pick = <T extends number>(
    title: string,
    values: readonly T[],
    selected: number,
    label: (value: T) => string,
    save: (value: T) => void,
  ) =>
    showOptions({
      title,
      options: values.map((value) => ({
        label: label(value),
        value,
        selected: value === selected,
      })),
      onSelect: save,
    });

  const share = t("home.settings.quality.share");
  const remeasureAfter = t("home.settings.quality.remeasure_after");
  const floor = t("home.settings.quality.in_network_min");
  const lastMeasure = measuring
    ? t("home.settings.quality.measuring")
    : lastMeasureLabel(t, last, i18n.language);

  return (
    <>
      <TVSettingsOptionButton
        label={share}
        value={autoBitrateRatioLabel(settings.autoBitrateRatio, i18n.language)}
        onPress={() =>
          pick(
            share,
            AUTO_BITRATE_RATIO_CHOICES,
            settings.autoBitrateRatio,
            (ratio) => autoBitrateRatioLabel(ratio, i18n.language),
            (ratio) => updateSettings({ autoBitrateRatio: ratio }),
          )
        }
      />
      <TVSettingsOptionButton
        label={remeasureAfter}
        value={autoBitrateTtlLabel(t, settings.autoBitrateTtlMinutes)}
        onPress={() =>
          pick(
            remeasureAfter,
            AUTO_BITRATE_TTL_CHOICES,
            settings.autoBitrateTtlMinutes,
            (minutes) => autoBitrateTtlLabel(t, minutes),
            (minutes) => updateSettings({ autoBitrateTtlMinutes: minutes }),
          )
        }
      />
      <TVSettingsOptionButton
        label={floor}
        value={autoBitrateFloorLabel(t, settings.autoBitrateInNetworkMin)}
        onPress={() =>
          pick(
            floor,
            AUTO_BITRATE_IN_NETWORK_MIN_CHOICES,
            settings.autoBitrateInNetworkMin,
            (bitrate) => autoBitrateFloorLabel(t, bitrate),
            (bitrate) => updateSettings({ autoBitrateInNetworkMin: bitrate }),
          )
        }
      />
      <TVSettingsToggle
        label={t("home.settings.quality.adapt")}
        value={settings.autoBitrateAdapt}
        onToggle={(autoBitrateAdapt) => updateSettings({ autoBitrateAdapt })}
      />
      <TVSettingsOptionButton
        label={t("home.settings.quality.measure_now")}
        value={lastMeasure}
        disabled={measuring}
        onPress={() => void measure()}
      />
    </>
  );
};
