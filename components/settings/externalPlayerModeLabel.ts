import type { ExternalPlayerMode } from "@/constants/ExternalPlayer";

/** Kept out of ExternalPlayerSettings so the TV settings page does not load the phone UI. */
export const EXTERNAL_PLAYER_MODE_LABEL_KEYS: Record<
  ExternalPlayerMode,
  string
> = {
  off: "home.settings.external_player.mode_off",
  askOnLongPress: "home.settings.external_player.mode_ask_on_long_press",
  ask: "home.settings.external_player.mode_ask",
  external: "home.settings.external_player.mode_external",
};
