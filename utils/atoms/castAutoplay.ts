/**
 * Countdown state for Chromecast next-episode autoplay. The watcher
 * (`useCastAutoplay`) writes it; the casting-player overlay reads it.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom } from "jotai";

export interface CastAutoplayState {
  /** The episode queued to play next. */
  nextEpisode: BaseItemDto;
  /** Seconds left before it loads. */
  secondsRemaining: number;
}

/** Active cast autoplay countdown, or null when none is running. */
export const castAutoplayAtom = atom<CastAutoplayState | null>(null);
