import type { TFunction } from "i18next";
import type { StillWatchingPreset } from "@/constants/StillWatching";

export const stillWatchingPresetLabel = (
  t: TFunction,
  preset: StillWatchingPreset,
): string =>
  preset === "disabled"
    ? t("home.settings.other.disabled")
    : t(`home.settings.other.still_watching_presets.${preset}`);
