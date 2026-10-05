import type { TFunction } from "i18next";
import type { StillWatchingPreset } from "@/constants/StillWatching";
import { isStillWatchingPreset } from "@/utils/stillWatching";

export const stillWatchingPresetLabel = (
  t: TFunction,
  preset: StillWatchingPreset,
): string =>
  // A value from storage this build does not know reads as off, as it acts.
  preset === "disabled" || !isStillWatchingPreset(preset)
    ? t("home.settings.other.disabled")
    : t(`home.settings.other.still_watching_presets.${preset}`);
