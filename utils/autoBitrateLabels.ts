import type { TFunction } from "i18next";

/** A share of the measured speed, as a percentage of the app's language. */
export const autoBitrateRatioLabel = (ratio: number, language: string) =>
  new Intl.NumberFormat(language, { style: "percent" }).format(ratio);

// The inactivity timeout already names these durations, translated.
const TTL_KEYS: Record<number, string> = {
  15: "home.settings.security.inactivity_timeout.15_minutes",
  30: "home.settings.security.inactivity_timeout.30_minutes",
  60: "home.settings.security.inactivity_timeout.1_hour",
  240: "home.settings.security.inactivity_timeout.4_hours",
  1440: "home.settings.security.inactivity_timeout.24_hours",
};

/** How long a measure is used, named by the inactivity timeout's durations. */
export const autoBitrateTtlLabel = (t: TFunction, minutes: number): string =>
  TTL_KEYS[minutes] ? t(TTL_KEYS[minutes]) : `${minutes} min`;

/** A floor in the server's network: in Mb/s, as the qualities are named. */
export const autoBitrateFloorLabel = (t: TFunction, bitrate: number): string =>
  bitrate === 0
    ? t("home.settings.quality.in_network_min_none")
    : `${bitrate / 1_000_000} Mb/s`;

/** A measured bitrate in Mb/s, to a tenth. */
export const megabitsLabel = (bitrate: number, language: string) =>
  `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(
    bitrate / 1_000_000,
  )} Mb/s`;

/**
 * What the settings say of Auto's last measure: the bitrate it streams at,
 * kept next to why a later measure failed, as playback still uses it.
 */
export const lastMeasureLabel = (
  t: TFunction,
  last: { bitrate?: number; failure?: string },
  language: string,
): string => {
  const bitrate =
    last.bitrate === undefined
      ? undefined
      : megabitsLabel(last.bitrate, language);
  if (last.failure !== undefined) {
    return bitrate === undefined
      ? t("home.settings.quality.last_measure_failed", { cause: last.failure })
      : t("home.settings.quality.last_measure_kept", {
          bitrate,
          cause: last.failure,
        });
  }
  return bitrate ?? t("home.settings.quality.last_measure_none");
};
