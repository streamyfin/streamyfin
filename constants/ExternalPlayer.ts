/**
 * Where a tap on the play button sends video. `ask` shows a sheet with
 * Streamyfin, the other player app and the system chooser; `askOnLongPress`
 * plays a tap in Streamyfin and shows that sheet on a long press; `external`
 * goes straight to the other app and also leaves the sheet to a long press.
 */
export const EXTERNAL_PLAYER_MODES = [
  "off",
  "askOnLongPress",
  "ask",
  "external",
] as const;
export type ExternalPlayerMode = (typeof EXTERNAL_PLAYER_MODES)[number];

/** Off, so every install keeps playing in Streamyfin until someone opts in. */
export const DEFAULT_EXTERNAL_PLAYER_MODE: ExternalPlayerMode = "off";
