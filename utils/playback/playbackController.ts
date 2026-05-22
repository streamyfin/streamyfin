/**
 * The canonical playback-control surface. Every player (cast, native video,
 * music) implements this interface and registers itself as the active
 * controller while it is playing, so remote-control commands can be routed to
 * whatever is currently playing.
 */

import { atom, useSetAtom } from "jotai";
import { useEffect } from "react";

export interface PlaybackController {
  playPause(): void;
  pause(): void;
  unpause(): void;
  stop(): void;
  /** Absolute seek position in milliseconds. */
  seek(positionMs: number): void;
  next(): void;
  previous(): void;
  /** Volume 0-1. */
  setVolume(level: number): void;
  toggleMute(): void;
}

/** The currently-active playback controller, or null when nothing is playing. */
export const activePlaybackControllerAtom = atom<PlaybackController | null>(
  null,
);

/**
 * Register `controller` as the active playback controller while `active` is
 * true. Clears the atom on unmount or when `active` becomes false — but only if
 * the atom still holds this exact controller (so a newer registration wins).
 */
export const useRegisterPlaybackController = (
  controller: PlaybackController | null,
  active: boolean,
): void => {
  const setController = useSetAtom(activePlaybackControllerAtom);
  useEffect(() => {
    if (!active || !controller) return;
    setController(controller);
    return () => {
      setController((current) => (current === controller ? null : current));
    };
  }, [active, controller, setController]);
};
