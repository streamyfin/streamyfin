/**
 * Which items play in another player app on the device instead of
 * Streamyfin's own. `downloads` hands over downloaded files only; `all` also
 * hands over online items, as a direct stream of the original file.
 */
export const EXTERNAL_PLAYER_MODES = ["off", "downloads", "all"] as const;
export type ExternalPlayerMode = (typeof EXTERNAL_PLAYER_MODES)[number];

/** Off, so every install keeps playing in Streamyfin until someone opts in. */
export const DEFAULT_EXTERNAL_PLAYER_MODE: ExternalPlayerMode = "off";
