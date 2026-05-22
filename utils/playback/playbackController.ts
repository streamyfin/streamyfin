/**
 * The canonical playback-control surface. Every player (cast, native video,
 * music) implements this interface and registers itself as the active
 * controller while it is playing, so remote-control commands can be routed to
 * whatever is currently playing.
 */

import { atom, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

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
 * true. Cleared on unmount or when `active` becomes false.
 *
 * The registered value is a *stable proxy* whose identity never changes — it
 * forwards each call to whatever `controller` is current (tracked via a ref).
 * This keeps the registration effect's dependencies stable (`active` only), so
 * a `controller` that is recreated every render does NOT re-run the effect and
 * cannot cause a `setState`/render loop.
 */
export const useRegisterPlaybackController = (
  controller: PlaybackController | null,
  active: boolean,
): void => {
  const setController = useSetAtom(activePlaybackControllerAtom);

  // Always points at the latest controller passed in.
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  // Created once; its identity is stable for the component's lifetime.
  const proxyRef = useRef<PlaybackController | null>(null);
  if (proxyRef.current === null) {
    proxyRef.current = {
      playPause: () => controllerRef.current?.playPause(),
      pause: () => controllerRef.current?.pause(),
      unpause: () => controllerRef.current?.unpause(),
      stop: () => controllerRef.current?.stop(),
      seek: (positionMs) => controllerRef.current?.seek(positionMs),
      next: () => controllerRef.current?.next(),
      previous: () => controllerRef.current?.previous(),
      setVolume: (level) => controllerRef.current?.setVolume(level),
      toggleMute: () => controllerRef.current?.toggleMute(),
    };
  }

  useEffect(() => {
    if (!active) return;
    const proxy = proxyRef.current;
    setController(proxy);
    return () => {
      setController((current) => (current === proxy ? null : current));
    };
  }, [active, setController]);
};
