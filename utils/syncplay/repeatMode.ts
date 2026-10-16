import { SYNCPLAY_REPEAT_MODES } from "@/constants/SyncPlay";
import type { SyncPlayRepeatMode } from "./types";

/** The mode a press on Repeat moves to: a remote and a row have no menu. */
export const nextSyncPlayRepeatMode = (
  mode: SyncPlayRepeatMode,
): SyncPlayRepeatMode =>
  SYNCPLAY_REPEAT_MODES[
    (SYNCPLAY_REPEAT_MODES.indexOf(mode) + 1) % SYNCPLAY_REPEAT_MODES.length
  ];
