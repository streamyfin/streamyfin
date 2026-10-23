import type { ExternalPlayerMode } from "@/constants/ExternalPlayer";

/** Kept out of ExternalPlayerSettings so the TV settings page does not load the phone UI. */
export const EXTERNAL_PLAYER_MODE_LABEL_KEYS: Record<
  ExternalPlayerMode,
  string
> = {
  off: "home.settings.external_player.mode_off",
  downloads: "home.settings.external_player.mode_downloads",
  all: "home.settings.external_player.mode_all",
};
