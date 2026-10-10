import type { TFunction } from "i18next";
import type { StillWatchingPreset } from "@/constants/StillWatching";
import { coerceStillWatchingPreset } from "@/utils/stillWatching";

export const stillWatchingPresetLabel = (
  t: TFunction,
  value: StillWatchingPreset,
): string => {
  // Labelled as it acts: a value this build does not know as its nearest.
  const preset = coerceStillWatchingPreset(value) ?? "disabled";
  return preset === "disabled"
    ? t("home.settings.other.disabled")
    : t(`home.settings.other.still_watching_presets.${preset}`);
};
