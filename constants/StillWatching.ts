/**
 * "Still watching?" presets, matching jellyfin-web 12's stillWatching plugin
 * so a viewer who moves between clients gets the same prompt timing.
 *
 * The prompt fires once a session has run for `minutes`, and then either the
 * viewer has been idle for that long or `episodes` have auto-played.
 */
export type StillWatchingPreset =
  | "disabled"
  | "short"
  | "default"
  | "long"
  | "veryLong";

export type StillWatchingThresholds = {
  episodes: number;
  minutes: number;
};

export const StillWatchingPresets: Record<
  Exclude<StillWatchingPreset, "disabled">,
  StillWatchingThresholds
> = {
  short: { episodes: 2, minutes: 60 },
  default: { episodes: 3, minutes: 90 },
  long: { episodes: 5, minutes: 150 },
  veryLong: { episodes: 8, minutes: 240 },
};

/** Display order for the settings pickers. */
export const STILL_WATCHING_PRESET_ORDER: readonly StillWatchingPreset[] = [
  "disabled",
  "short",
  "default",
  "long",
  "veryLong",
];

export const DEFAULT_STILL_WATCHING_PRESET: StillWatchingPreset = "default";
